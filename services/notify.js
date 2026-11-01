/* ============================================================
   services/notify.js — Push notification & in-app notification service
   
   Usage:
     const { notify } = require('./services/notify');
     await notify([userId1, userId2], {
       type: 'assigned',
       title: 'New task assigned',
       body: 'You were assigned "Fix login bug"',
       taskId: 'xxx',
       boardId: 'yyy',
       actorId: req.user.id   // skipped from recipients
     });
   ============================================================ */

const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');

let _messaging = null;
let fcmDryRun = false;

/* ── Firebase Admin initialisation ───────────────────────────── */
function initFirebase() {
  try {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const fs = require('fs');

    // Already initialised
    if (getApps().length > 0) {
      _messaging = getMessaging();
      console.log('🔔 Firebase Admin already initialised');
      return;
    }

    let serviceAccount = null;

    // Option A: JSON string in env (good for Render secrets)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }
    // Option B: path to JSON file
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const filePath = require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      if (fs.existsSync(filePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    }

    if (!serviceAccount) {
      console.warn('⚠️  Firebase credentials not set — push notifications in dry-run mode');
      fcmDryRun = true;
      return;
    }

    initializeApp({ credential: cert(serviceAccount) });
    _messaging = getMessaging();
    console.log(`🔔 Firebase Admin initialised — project: ${serviceAccount.project_id}`);
  } catch (err) {
    console.error('Firebase Admin init error:', err.message);
    console.warn('⚠️  Running in push dry-run mode');
    fcmDryRun = true;
  }
}

/* ── Core notify function ─────────────────────────────────────── */
/**
 * @param {string[]} userIds  — recipients
 * @param {object}  opts
 *   @param {string} opts.type        — 'assigned' | 'comment' | 'moved' | 'completed' | 'due_soon' | 'overdue'
 *   @param {string} opts.title
 *   @param {string} opts.body
 *   @param {string} [opts.taskId]
 *   @param {string} [opts.boardId]
 *   @param {string} [opts.actorId]   — exclude actor from recipients
 */
async function notify(userIds, opts) {
  const { type, title, body, taskId = null, boardId = null, actorId = null } = opts;

  // Filter out the actor and deduplicate
  const recipients = [...new Set(userIds.filter(id => id && id !== actorId))];
  if (!recipients.length) return;

  const prefColumn = {
    assigned: 'assigned',
    comment: 'comments',
    moved: 'status_changes',
    completed: 'status_changes',
    due_soon: 'due_soon',
    overdue: 'due_soon',
  }[type] || 'assigned';

  const deadTokens = [];

  for (const userId of recipients) {
    try {
      // Check notification prefs
      let prefs = await DB.get(
        'SELECT * FROM notification_prefs WHERE user_id = ?', [userId]
      );
      // Default prefs (all enabled) if not set
      if (!prefs) {
        prefs = { assigned: 1, comments: 1, due_soon: 1, status_changes: 1, push_enabled: 1 };
      }

      // Skip if this notification type is disabled
      if (!prefs[prefColumn]) continue;

      // Write in-app notification
      const notifId = uuidv4();
      await DB.run(
        `INSERT INTO notifications (id, user_id, type, title, body, task_id, board_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [notifId, userId, type, title, body, taskId, boardId]
      );

      // Send FCM push if enabled
      if (!prefs.push_enabled || fcmDryRun || !_messaging) continue;

      const tokens = await DB.all(
        'SELECT token FROM device_tokens WHERE user_id = ?', [userId]
      );
      if (!tokens.length) continue;

      const tokenValues = tokens.map(t => t.token);
      const message = {
        tokens: tokenValues,
        notification: { title, body },
        data: {
          type,
          taskId: taskId || '',
          boardId: boardId || '',
          notificationId: notifId,
        },
        android: {
          priority: 'high',
          notification: { channelId: 'teamflow_tasks', sound: 'default' },
        },
      };

      try {
        const response = await _messaging.sendEachForMulticast(message);
        response.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              deadTokens.push(tokenValues[idx]);
            }
          }
        });
      } catch (fcmErr) {
        console.error('FCM send error:', fcmErr.message);
      }
    } catch (err) {
      console.error(`notify error for user ${userId}:`, err.message);
    }
  }

  // Clean up dead FCM tokens
  for (const deadToken of deadTokens) {
    try {
      await DB.run('DELETE FROM device_tokens WHERE token = ?', [deadToken]);
    } catch (_) {}
  }
}

/* ── Initialise on module load ────────────────────────────────── */
initFirebase();

module.exports = { notify, fcmDryRun: () => fcmDryRun };
