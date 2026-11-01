/* ============================================================
   middleware/auth.js — Session auth, role guards, subsystem filters
   ============================================================ */

const DB = require('../database/db');

const SESSION_COOKIE = 'tf_session';

/**
 * Retrieve active user and subsystem info for a given session ID.
 * Returns a user object or null.
 */
async function getSessionUser(sessionId) {
  if (!sessionId) return null;

  try {
    const session = await DB.get(`
      SELECT s.id as session_id, s.expires_at,
             u.id, u.username, u.display_name, u.role,
             u.subsystem_id, u.color, u.email, u.created_at,
             u.must_change_password,
             sub.name as subsystem_name,
             sub.color as subsystem_color,
             sub.icon as subsystem_icon
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN subsystems sub ON u.subsystem_id = sub.id
      WHERE s.id = ?
    `, [sessionId]);

    if (!session) return null;

    // Check expiry
    const now = new Date();
    const expiry = new Date(session.expires_at);
    if (isNaN(expiry.getTime()) || expiry <= now) {
      try { await DB.run('DELETE FROM sessions WHERE id = ?', [sessionId]); } catch (_) {}
      return null;
    }

    return {
      id: session.id,
      username: session.username,
      display_name: session.display_name,
      role: session.role,
      subsystem_id: session.subsystem_id,
      color: session.color,
      email: session.email,
      created_at: session.created_at,
      must_change_password: session.must_change_password || 0,
      subsystem_name: session.subsystem_name || null,
      subsystem_color: session.subsystem_color || null,
      subsystem_icon: session.subsystem_icon || null,
      session_id: session.session_id,
    };
  } catch (err) {
    console.error('Error fetching session user:', err.message);
    return null;
  }
}

/**
 * Extract the bearer token from request (cookie or Authorization header).
 */
function extractToken(req) {
  return req.cookies?.[SESSION_COOKIE] ||
         req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
         null;
}

/**
 * Middleware: require authenticated user.
 * Attaches req.user on success; 401 on failure.
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const user = await getSessionUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Authentication internal server error' });
  }
}

/**
 * Middleware: require super admin privileges.
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      const user = await getSessionUser(token);
      if (!user) return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
      req.user = user;
    }

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Super admin privileges required' });
    }

    next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    res.status(500).json({ error: 'Admin authorization internal server error' });
  }
}

/**
 * Helper & middleware: compute the subsystem_id filter for a request.
 * - super_admin: returns req.query._subsystem (or null = all)
 * - member: returns their own subsystem_id
 * Works as middleware (sets req.subsystemId) or as a direct call (returns the id).
 */
function attachSubsystemFilter(req, res, next) {
  let filter = null;
  if (req.user?.role === 'super_admin') {
    filter = req.query?._subsystem || null;
  } else if (req.user) {
    filter = req.user.subsystem_id || null;
  }

  if (typeof next === 'function') {
    req.subsystemId = filter;
    return next();
  }

  return filter;
}

module.exports = {
  getSessionUser,
  extractToken,
  requireAuth,
  requireAdmin,
  attachSubsystemFilter,
};
