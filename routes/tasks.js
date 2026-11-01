/* ============================================================
   routes/tasks.js — Tasks API (async, with notify triggers)
   ============================================================ */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { logActivity } = require('./boards');
const { requireAuth, attachSubsystemFilter } = require('../middleware/auth');
const { notify } = require('../services/notify');

router.use(requireAuth);

async function checkBoardAccess(boardId, user) {
  const board = await DB.get('SELECT * FROM boards WHERE id = ?', [boardId]);
  if (!board) return { allowed: false, status: 404, error: 'Board not found' };
  if (user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== user.subsystem_id) {
    return { allowed: false, status: 403, error: 'Access denied: Board belongs to another subsystem' };
  }
  return { allowed: true, board };
}

async function enrichTask(task) {
  const assignees = await DB.all(`SELECT m.* FROM members m JOIN task_assignees ta ON ta.member_id=m.id WHERE ta.task_id=?`, [task.id]);
  const labels = await DB.all(`SELECT l.* FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=?`, [task.id]);
  const checklists = await DB.all('SELECT * FROM checklists WHERE task_id=? ORDER BY position', [task.id]);
  const comments = await DB.all(`
    SELECT c.*, COALESCE(u.display_name,m.name,c.author_name) as member_name,
           COALESCE(u.color,m.color,'#007AFF') as member_color
    FROM comments c LEFT JOIN users u ON c.member_id=u.id LEFT JOIN members m ON c.member_id=m.id
    WHERE c.task_id=? ORDER BY c.created_at ASC`, [task.id]);
  const attachments = await DB.all(
    'SELECT id,task_id,filename,original_name,file_size,mime_type,uploaded_by,created_at FROM attachments WHERE task_id=? ORDER BY created_at DESC',
    [task.id]);
  return { ...task, assignees, labels, checklists, comments, attachments };
}

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const { board_id, bucket_id, member_id, priority, overdue, search } = req.query;
    const subsystemId = attachSubsystemFilter(req);
    let query = 'SELECT t.* FROM tasks t JOIN boards b ON t.board_id=b.id WHERE 1=1';
    const params = [];
    if (subsystemId) { query += ' AND b.subsystem_id=?'; params.push(subsystemId); }
    if (board_id)    { query += ' AND t.board_id=?'; params.push(board_id); }
    if (bucket_id)   { query += ' AND t.bucket_id=?'; params.push(bucket_id); }
    if (priority)    { query += ' AND t.priority=?'; params.push(priority); }
    if (overdue==='true') query += " AND t.due_date<date('now') AND t.completed=0";
    if (member_id)   { query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE member_id=?)'; params.push(member_id); }
    if (search)      { query += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
    query += ' ORDER BY t.position';
    const tasks = await DB.all(query, params);
    res.json(await Promise.all(tasks.map(enrichTask)));
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const task = await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const access = await checkBoardAccess(task.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    res.json(await enrichTask(task));
  } catch (err) {
    console.error('GET /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve task' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { board_id, bucket_id, title, description='', priority='medium', due_date=null, assignees=[], labels=[] } = req.body;
    if (!board_id || !bucket_id || !title || !title.trim()) return res.status(400).json({ error: 'board_id, bucket_id, title required' });
    const access = await checkBoardAccess(board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const maxRow = await DB.get('SELECT MAX(position) as maxPos FROM tasks WHERE bucket_id=?', [bucket_id]);
    const id = uuidv4();
    await DB.run('INSERT INTO tasks (id,board_id,bucket_id,title,description,priority,due_date,position,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, board_id, bucket_id, title.trim(), description.trim(), priority, due_date, (maxRow?.maxPos??-1)+1, req.user.id]);
    for (const memberId of assignees) await DB.run('INSERT OR IGNORE INTO task_assignees (task_id,member_id) VALUES (?,?)', [id, memberId]);
    for (const labelId of labels) await DB.run('INSERT OR IGNORE INTO task_labels (task_id,label_id) VALUES (?,?)', [id, labelId]);
    await logActivity(board_id, id, 'task_created', `Task "${title.trim()}" created`, req.user.display_name||req.user.username);
    if (assignees.length > 0) {
      notify(assignees, { type:'assigned', title:'📋 Task assigned to you', body:`"${title.trim()}" was assigned to you`, taskId:id, boardId:board_id, actorId:req.user.id }).catch(console.error);
    }
    res.status(201).json(await enrichTask(await DB.get('SELECT * FROM tasks WHERE id=?', [id])));
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  try {
    const task = await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Not found' });
    const access = await checkBoardAccess(task.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { title, description, priority, due_date, completed, bucket_id, assignees, labels } = req.body;
    await DB.run(
      `UPDATE tasks SET title=COALESCE(?,title), description=COALESCE(?,description), priority=COALESCE(?,priority), due_date=?, completed=COALESCE(?,completed), bucket_id=COALESCE(?,bucket_id), updated_at=datetime('now') WHERE id=?`,
      [title!==undefined?title.trim():null, description!==undefined?description.trim():null, priority,
       due_date!==undefined?due_date:task.due_date, completed, bucket_id, req.params.id]
    );
    if (assignees !== undefined) {
      const old = await DB.all('SELECT member_id FROM task_assignees WHERE task_id=?', [req.params.id]);
      const oldIds = old.map(a=>a.member_id);
      const newAssignees = assignees.filter(id=>!oldIds.includes(id));
      await DB.run('DELETE FROM task_assignees WHERE task_id=?', [req.params.id]);
      for (const memberId of assignees) await DB.run('INSERT OR IGNORE INTO task_assignees (task_id,member_id) VALUES (?,?)', [req.params.id, memberId]);
      if (newAssignees.length > 0) {
        notify(newAssignees, { type:'assigned', title:'📋 Task assigned to you', body:`"${title!==undefined?title.trim():task.title}" was assigned to you`, taskId:req.params.id, boardId:task.board_id, actorId:req.user.id }).catch(console.error);
      }
    }
    if (labels !== undefined) {
      await DB.run('DELETE FROM task_labels WHERE task_id=?', [req.params.id]);
      for (const labelId of labels) await DB.run('INSERT OR IGNORE INTO task_labels (task_id,label_id) VALUES (?,?)', [req.params.id, labelId]);
    }
    if (completed !== undefined && completed !== task.completed) {
      const currentAssignees = await DB.all('SELECT member_id FROM task_assignees WHERE task_id=?', [req.params.id]);
      notify(currentAssignees.map(a=>a.member_id), { type:completed?'completed':'moved', title:completed?'✅ Task completed':'🔄 Task status changed', body:`"${title!==undefined?title.trim():task.title}" was marked ${completed?'complete':'incomplete'}`, taskId:req.params.id, boardId:task.board_id, actorId:req.user.id }).catch(console.error);
    }
    await logActivity(task.board_id, req.params.id, 'task_updated', `Task "${title!==undefined?title.trim():task.title}" updated`, req.user.display_name||req.user.username);
    res.json(await enrichTask(await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id])));
  } catch (err) {
    console.error('PUT /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// PUT /api/tasks/:id/move
router.put('/:id/move', async (req, res) => {
  try {
    const { bucket_id, position } = req.body;
    const task = await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Not found' });
    const access = await checkBoardAccess(task.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    await DB.run('UPDATE tasks SET position=position+1 WHERE bucket_id=? AND position>=?', [bucket_id, position]);
    await DB.run("UPDATE tasks SET bucket_id=?, position=?, updated_at=datetime('now') WHERE id=?", [bucket_id, position, req.params.id]);
    await logActivity(task.board_id, req.params.id, 'task_moved', `Task "${task.title}" moved`, req.user.display_name||req.user.username);
    const assignees = await DB.all('SELECT member_id FROM task_assignees WHERE task_id=?', [req.params.id]);
    notify(assignees.map(a=>a.member_id), { type:'moved', title:'🔄 Task moved', body:`"${task.title}" was moved`, taskId:req.params.id, boardId:task.board_id, actorId:req.user.id }).catch(console.error);
    res.json(await enrichTask(await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id])));
  } catch (err) {
    console.error('PUT /api/tasks/:id/move error:', err);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const task = await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const access = await checkBoardAccess(task.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    await logActivity(task.board_id, req.params.id, 'task_deleted', `Task "${task.title}" deleted`, req.user.display_name||req.user.username);
    await DB.run('DELETE FROM tasks WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST /api/tasks/:id/checklist
router.post('/:id/checklist', async (req, res) => {
  try {
    const task = await DB.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const access = await checkBoardAccess(task.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { text } = req.body;
    if (!text||!text.trim()) return res.status(400).json({ error: 'text is required' });
    const maxRow = await DB.get('SELECT MAX(position) as maxPos FROM checklists WHERE task_id=?', [req.params.id]);
    const id = uuidv4();
    await DB.run('INSERT INTO checklists (id,task_id,text,position) VALUES (?,?,?,?)', [id, req.params.id, text.trim(), (maxRow?.maxPos??-1)+1]);
    res.status(201).json(await DB.get('SELECT * FROM checklists WHERE id=?', [id]));
  } catch (err) { res.status(500).json({ error: 'Failed to add checklist item' }); }
});

// PUT /api/tasks/checklist/:cid
router.put('/checklist/:cid', async (req, res) => {
  try {
    const item = await DB.get('SELECT c.*, t.board_id FROM checklists c JOIN tasks t ON c.task_id=t.id WHERE c.id=?', [req.params.cid]);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    const access = await checkBoardAccess(item.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { text, completed } = req.body;
    await DB.run('UPDATE checklists SET text=COALESCE(?,text), completed=COALESCE(?,completed) WHERE id=?',
      [text!==undefined?text.trim():null, completed, req.params.cid]);
    res.json(await DB.get('SELECT * FROM checklists WHERE id=?', [req.params.cid]));
  } catch (err) { res.status(500).json({ error: 'Failed to update checklist item' }); }
});

// DELETE /api/tasks/checklist/:cid
router.delete('/checklist/:cid', async (req, res) => {
  try {
    const item = await DB.get('SELECT c.*, t.board_id FROM checklists c JOIN tasks t ON c.task_id=t.id WHERE c.id=?', [req.params.cid]);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    const access = await checkBoardAccess(item.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    await DB.run('DELETE FROM checklists WHERE id=?', [req.params.cid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete checklist item' }); }
});

// POST /api/tasks/labels/board/:boardId
router.post('/labels/board/:boardId', async (req, res) => {
  try {
    const access = await checkBoardAccess(req.params.boardId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { name, color='#007AFF' } = req.body;
    if (!name||!name.trim()) return res.status(400).json({ error: 'name is required' });
    const id = uuidv4();
    await DB.run('INSERT INTO labels (id,board_id,name,color) VALUES (?,?,?,?)', [id, req.params.boardId, name.trim(), color]);
    res.status(201).json(await DB.get('SELECT * FROM labels WHERE id=?', [id]));
  } catch (err) { res.status(500).json({ error: 'Failed to create label' }); }
});

module.exports = router;
