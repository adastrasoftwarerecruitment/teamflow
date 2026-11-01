/* ============================================================
   routes/notifications.js — In-app & push notification endpoints
   ============================================================ */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// POST /api/notifications/register-device
router.post('/register-device', async (req, res) => {
  try {
    const { token, platform = 'android' } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'token is required' });
    }

    const id = uuidv4();
    await DB.run(
      `INSERT INTO device_tokens (id, user_id, token, platform)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         last_seen = datetime('now')`,
      [id, req.user.id, token.trim(), platform]
    );

    // Ensure notification prefs exist
    await DB.run(
      `INSERT OR IGNORE INTO notification_prefs (user_id) VALUES (?)`,
      [req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('register-device error:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// DELETE /api/notifications/device/:token
router.delete('/device/:token', async (req, res) => {
  try {
    await DB.run(
      'DELETE FROM device_tokens WHERE token = ? AND user_id = ?',
      [req.params.token, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('delete device error:', err);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

// GET /api/notifications — latest 50 + unread count
router.get('/', async (req, res) => {
  try {
    const notifications = await DB.all(
      `SELECT * FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );

    const unreadRow = await DB.get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
      [req.user.id]
    );

    res.json({
      notifications,
      unreadCount: unreadRow?.count || 0,
    });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res) => {
  try {
    await DB.run(
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res) => {
  try {
    await DB.run(
      'UPDATE notifications SET read = 1 WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('read-all error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// GET /api/notifications/prefs
router.get('/prefs', async (req, res) => {
  try {
    let prefs = await DB.get(
      'SELECT * FROM notification_prefs WHERE user_id = ?',
      [req.user.id]
    );
    if (!prefs) {
      // Return defaults
      prefs = {
        user_id: req.user.id,
        assigned: 1,
        comments: 1,
        due_soon: 1,
        status_changes: 1,
        push_enabled: 1,
      };
    }
    res.json(prefs);
  } catch (err) {
    console.error('GET prefs error:', err);
    res.status(500).json({ error: 'Failed to retrieve notification preferences' });
  }
});

// PUT /api/notifications/prefs
router.put('/prefs', async (req, res) => {
  try {
    const { assigned, comments, due_soon, status_changes, push_enabled } = req.body;

    await DB.run(
      `INSERT INTO notification_prefs (user_id, assigned, comments, due_soon, status_changes, push_enabled)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         assigned = COALESCE(excluded.assigned, assigned),
         comments = COALESCE(excluded.comments, comments),
         due_soon = COALESCE(excluded.due_soon, due_soon),
         status_changes = COALESCE(excluded.status_changes, status_changes),
         push_enabled = COALESCE(excluded.push_enabled, push_enabled)`,
      [
        req.user.id,
        assigned !== undefined ? (assigned ? 1 : 0) : null,
        comments !== undefined ? (comments ? 1 : 0) : null,
        due_soon !== undefined ? (due_soon ? 1 : 0) : null,
        status_changes !== undefined ? (status_changes ? 1 : 0) : null,
        push_enabled !== undefined ? (push_enabled ? 1 : 0) : null,
      ]
    );

    const updated = await DB.get(
      'SELECT * FROM notification_prefs WHERE user_id = ?',
      [req.user.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('PUT prefs error:', err);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
