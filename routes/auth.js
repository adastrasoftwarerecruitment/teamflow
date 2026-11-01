/* ============================================================
   routes/auth.js — Authentication: login, logout, me, change-password
   ============================================================ */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const DB = require('../database/db');
const { getSessionUser, extractToken } = require('../middleware/auth');

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = 'tf_session';

/* ── Rate limit login: 10 attempts / 15 min / IP ─────────────── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

/* ── Helpers ─────────────────────────────────────────────────── */
function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

function buildUserResponse(user, sessionId) {
  return {
    token: sessionId,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      subsystem_id: user.subsystem_id,
      subsystem_name: user.subsystem_name || null,
      subsystem_color: user.subsystem_color || null,
      subsystem_icon: user.subsystem_icon || null,
      color: user.color,
      email: user.email,
      created_at: user.created_at,
      must_change_password: user.must_change_password || 0,
    },
  };
}

/* ── POST /api/auth/login ────────────────────────────────────── */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await DB.get(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
      [username.trim()]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Create session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await DB.run(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
      [sessionId, user.id, expiresAt]
    );

    // Fetch subsystem details
    let subsystem_name = null, subsystem_color = null, subsystem_icon = null;
    if (user.subsystem_id) {
      const sub = await DB.get('SELECT name, color, icon FROM subsystems WHERE id = ?', [user.subsystem_id]);
      if (sub) {
        subsystem_name = sub.name;
        subsystem_color = sub.color;
        subsystem_icon = sub.icon;
      }
    }

    setSessionCookie(res, sessionId);

    res.json(buildUserResponse(
      { ...user, subsystem_name, subsystem_color, subsystem_icon },
      sessionId
    ));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

/* ── POST /api/auth/logout ───────────────────────────────────── */
router.post('/logout', async (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      await DB.run('DELETE FROM sessions WHERE id = ?', [token]);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'An error occurred during logout' });
  }
});

/* ── GET /api/auth/me ────────────────────────────────────────── */
router.get('/me', async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const user = await getSessionUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
    }

    // Return the user object directly (matches what the frontend expects)
    res.json({
      ...user,
      token,
    });
  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'An error occurred while fetching current user' });
  }
});

/* ── POST /api/auth/change-password ─────────────────────────── */
router.post('/change-password', async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const user = await getSessionUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });

    const { current, newPassword } = req.body;
    if (!current || !newPassword) {
      return res.status(400).json({ error: 'current and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Verify current password
    const dbUser = await DB.get('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const valid = bcrypt.compareSync(current, dbUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = bcrypt.hashSync(newPassword, 10);
    await DB.run(
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
