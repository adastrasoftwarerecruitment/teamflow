/* ============================================================
   routes/comments.js — Comments API (async, server-side identity)
   ============================================================ */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../services/notify');

router.use(requireAuth);

async function checkTaskAccess(taskId, user) {
  const task = await DB.get('SELECT t.*, b.subsystem_id FROM tasks t JOIN boards b ON t.board_id=b.id WHERE t.id=?', [taskId]);
  if (!task) return { allowed: false, status: 404, error: 'Task not found' };
  if (user.role!=='super_admin' && task.subsystem_id && task.subsystem_id!==user.subsystem_id) {
    return { allowed: false, status: 403, error: 'Access denied: Task belongs to another subsystem' };
  }
  return { allowed: true, task };
}

router.get('/task/:taskId', async (req, res) => {
  try {
    const access = await checkTaskAccess(req.params.taskId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const comments = await DB.all(`
      SELECT c.*, COALESCE(u.display_name,m.name,c.author_name) as member_name,
             COALESCE(u.color,m.color,'#007AFF') as member_color
      FROM comments c LEFT JOIN users u ON c.member_id=u.id LEFT JOIN members m ON c.member_id=m.id
      WHERE c.task_id=? ORDER BY c.created_at ASC`, [req.params.taskId]);
    res.json(comments);
  } catch (err) {
    console.error('GET /api/comments/task/:taskId error:', err);
    res.status(500).json({ error: 'Failed to retrieve comments' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { task_id, content } = req.body;
    if (!task_id||!content||!content.trim()) return res.status(400).json({ error: 'task_id and content required' });
    const access = await checkTaskAccess(task_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const id = uuidv4();
    // Always use server-side identity — never trust client
    await DB.run('INSERT INTO comments (id,task_id,member_id,author_name,content) VALUES (?,?,?,?,?)',
      [id, task_id, req.user.id, req.user.display_name||req.user.username, content.trim()]);
    const comment = await DB.get(`
      SELECT c.*, COALESCE(u.display_name,m.name,c.author_name) as member_name,
             COALESCE(u.color,m.color,'#007AFF') as member_color
      FROM comments c LEFT JOIN users u ON c.member_id=u.id LEFT JOIN members m ON c.member_id=m.id
      WHERE c.id=?`, [id]);
    // Notify assignees + creator (excluding the commenter)
    const task = access.task;
    const assignees = await DB.all('SELECT member_id FROM task_assignees WHERE task_id=?', [task_id]);
    const notifySet = new Set(assignees.map(a=>a.member_id));
    if (task.created_by) notifySet.add(task.created_by);
    notify([...notifySet], { type:'comment', title:'💬 New comment', body:`${req.user.display_name||req.user.username}: ${content.trim().slice(0,80)}`, taskId:task_id, boardId:task.board_id, actorId:req.user.id }).catch(console.error);
    res.status(201).json(comment);
  } catch (err) {
    console.error('POST /api/comments error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const comment = await DB.get('SELECT c.*,t.board_id,b.subsystem_id FROM comments c JOIN tasks t ON c.task_id=t.id JOIN boards b ON t.board_id=b.id WHERE c.id=?', [req.params.id]);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role!=='super_admin' && comment.subsystem_id && comment.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await DB.run('DELETE FROM comments WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/comments/:id error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
