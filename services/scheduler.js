/* ============================================================
   services/scheduler.js — Hourly cron for due-soon / overdue reminders
   ============================================================ */

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { notify } = require('./notify');

async function runReminders() {
  try {
    console.log('[scheduler] Running reminder check…');

    // Tasks due within the next 24 hours (not completed, not already reminded today)
    const dueSoonTasks = await DB.all(`
      SELECT t.id, t.title, t.board_id, t.due_date,
             ta.member_id as user_id
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.completed = 0
        AND t.due_date BETWEEN date('now') AND date('now', '+1 day')
        AND NOT EXISTS (
          SELECT 1 FROM reminder_log rl
          WHERE rl.task_id = t.id
            AND rl.user_id = ta.member_id
            AND rl.reminder_date = date('now')
            AND rl.type = 'due_soon'
        )
    `);

    // Overdue tasks (not completed, not already reminded today)
    const overdueTasks = await DB.all(`
      SELECT t.id, t.title, t.board_id, t.due_date,
             ta.member_id as user_id
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.completed = 0
        AND t.due_date < date('now')
        AND NOT EXISTS (
          SELECT 1 FROM reminder_log rl
          WHERE rl.task_id = t.id
            AND rl.user_id = ta.member_id
            AND rl.reminder_date = date('now')
            AND rl.type = 'overdue'
        )
    `);

    // Group by task → collect user IDs, send one notification per task
    const groupByTask = (rows) => {
      const map = new Map();
      rows.forEach(r => {
        if (!map.has(r.id)) map.set(r.id, { ...r, userIds: [] });
        map.get(r.id).userIds.push(r.user_id);
      });
      return [...map.values()];
    };

    for (const task of groupByTask(dueSoonTasks)) {
      await notify(task.userIds, {
        type: 'due_soon',
        title: '⏰ Task due soon',
        body: `"${task.title}" is due within 24 hours`,
        taskId: task.id,
        boardId: task.board_id,
      });

      // Log reminders to prevent duplicates
      for (const userId of task.userIds) {
        try {
          await DB.run(
            `INSERT OR IGNORE INTO reminder_log (id, user_id, task_id, reminder_date, type)
             VALUES (?, ?, ?, date('now'), 'due_soon')`,
            [uuidv4(), userId, task.id]
          );
        } catch (_) {}
      }
    }

    for (const task of groupByTask(overdueTasks)) {
      await notify(task.userIds, {
        type: 'overdue',
        title: '🚨 Task overdue',
        body: `"${task.title}" was due on ${task.due_date}`,
        taskId: task.id,
        boardId: task.board_id,
      });

      for (const userId of task.userIds) {
        try {
          await DB.run(
            `INSERT OR IGNORE INTO reminder_log (id, user_id, task_id, reminder_date, type)
             VALUES (?, ?, ?, date('now'), 'overdue')`,
            [uuidv4(), userId, task.id]
          );
        } catch (_) {}
      }
    }

    const total = dueSoonTasks.length + overdueTasks.length;
    if (total) console.log(`[scheduler] Sent reminders for ${total} task-user pairs`);
  } catch (err) {
    console.error('[scheduler] Reminder check failed:', err.message);
  }
}

function startScheduler() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', runReminders);
  console.log('⏱️  Reminder scheduler started (runs every hour)');
}

module.exports = { startScheduler, runReminders };
