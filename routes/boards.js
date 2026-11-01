/* ============================================================
   routes/boards.js — Boards API (async, Turso-compatible)
   ============================================================ */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth, attachSubsystemFilter } = require('../middleware/auth');

router.use(requireAuth);

async function logActivity(boardId, taskId, action, detail, actor) {
  await DB.run(
    'INSERT INTO activity_log (id, board_id, task_id, action, detail, actor) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), boardId, taskId, action, detail, actor]
  );
}

async function enrichTask(task) {
  const assignees = await DB.all(`SELECT m.* FROM members m JOIN task_assignees ta ON ta.member_id = m.id WHERE ta.task_id = ?`, [task.id]);
  const labels = await DB.all(`SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ?`, [task.id]);
  const checklists = await DB.all('SELECT * FROM checklists WHERE task_id = ? ORDER BY position', [task.id]);
  const commentRow = await DB.get('SELECT COUNT(*) as count FROM comments WHERE task_id = ?', [task.id]);
  const attachRow = await DB.get('SELECT COUNT(*) as count FROM attachments WHERE task_id = ?', [task.id]);
  return { ...task, assignees, labels, checklists, commentCount: commentRow?.count || 0, attachmentCount: attachRow?.count || 0 };
}

// GET /api/boards
router.get('/', async (req, res) => {
  try {
    const subsystemId = attachSubsystemFilter(req);
    const boards = subsystemId
      ? await DB.all('SELECT * FROM boards WHERE subsystem_id = ? ORDER BY created_at DESC', [subsystemId])
      : await DB.all('SELECT * FROM boards ORDER BY created_at DESC');

    const result = await Promise.all(boards.map(async board => {
      const buckets = await DB.all('SELECT * FROM buckets WHERE board_id = ? ORDER BY position', [board.id]);
      const taskRow = await DB.get('SELECT COUNT(*) as count FROM tasks WHERE board_id = ?', [board.id]);
      const completedRow = await DB.get('SELECT COUNT(*) as count FROM tasks WHERE board_id = ? AND completed = 1', [board.id]);
      return { ...board, buckets, taskCount: taskRow?.count || 0, completedCount: completedRow?.count || 0 };
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /api/boards error:', err);
    res.status(500).json({ error: 'Failed to retrieve boards' });
  }
});

// GET /api/boards/:id
router.get('/:id', async (req, res) => {
  try {
    const board = await DB.get('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (req.user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied: Board belongs to another subsystem' });
    }
    const buckets = await DB.all('SELECT * FROM buckets WHERE board_id = ? ORDER BY position', [board.id]);
    const bucketsWithTasks = await Promise.all(buckets.map(async bucket => {
      const tasks = await DB.all('SELECT * FROM tasks WHERE bucket_id = ? ORDER BY position', [bucket.id]);
      return { ...bucket, tasks: await Promise.all(tasks.map(enrichTask)) };
    }));
    const labels = await DB.all('SELECT * FROM labels WHERE board_id = ?', [board.id]);
    res.json({ ...board, buckets: bucketsWithTasks, labels });
  } catch (err) {
    console.error('GET /api/boards/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve board details' });
  }
});

// POST /api/boards
router.post('/', async (req, res) => {
  try {
    const { name, description = '', color = '#007AFF', icon = '📋' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    let subsystemId = req.user.subsystem_id || null;
    if (req.user.role === 'super_admin') subsystemId = req.body.subsystem_id !== undefined ? req.body.subsystem_id : null;
    const id = uuidv4();
    await DB.run('INSERT INTO boards (id, name, description, color, icon, subsystem_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name.trim(), description.trim(), color, icon, subsystemId]);
    for (let i = 0; i < ['To Do','In Progress','In Review','Done'].length; i++) {
      await DB.run('INSERT INTO buckets (id, board_id, name, position) VALUES (?, ?, ?, ?)',
        [uuidv4(), id, ['To Do','In Progress','In Review','Done'][i], i]);
    }
    const board = await DB.get('SELECT * FROM boards WHERE id = ?', [id]);
    await logActivity(id, null, 'board_created', `Board "${name.trim()}" created`, req.user.display_name || req.user.username);
    res.status(201).json(board);
  } catch (err) {
    console.error('POST /api/boards error:', err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// PUT /api/boards/:id
router.put('/:id', async (req, res) => {
  try {
    const board = await DB.get('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (req.user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, description, color, icon, subsystem_id } = req.body;
    const targetSubsystem = (req.user.role === 'super_admin' && subsystem_id !== undefined) ? subsystem_id : board.subsystem_id;
    await DB.run(
      `UPDATE boards SET name=COALESCE(?,name), description=COALESCE(?,description), color=COALESCE(?,color), icon=COALESCE(?,icon), subsystem_id=?, updated_at=datetime('now') WHERE id=?`,
      [name?name.trim():null, description!==undefined?description.trim():null, color, icon, targetSubsystem, req.params.id]
    );
    res.json(await DB.get('SELECT * FROM boards WHERE id = ?', [req.params.id]));
  } catch (err) {
    console.error('PUT /api/boards/:id error:', err);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// DELETE /api/boards/:id
router.delete('/:id', async (req, res) => {
  try {
    const board = await DB.get('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (req.user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await DB.run('DELETE FROM boards WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/boards/:id error:', err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// GET /api/boards/:id/activity
router.get('/:id/activity', async (req, res) => {
  try {
    const board = await DB.get('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (req.user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const activity = await DB.all('SELECT * FROM activity_log WHERE board_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    res.json(activity);
  } catch (err) {
    console.error('GET /api/boards/:id/activity error:', err);
    res.status(500).json({ error: 'Failed to retrieve board activity' });
  }
});

module.exports = router;
module.exports.enrichTask = enrichTask;
module.exports.logActivity = logActivity;
