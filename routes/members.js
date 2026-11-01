/* ============================================================
   routes/members.js — Members API (async, users as source of truth)
   ============================================================ */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth, attachSubsystemFilter } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const subsystemId = attachSubsystemFilter(req);
    const users = subsystemId
      ? await DB.all('SELECT id,username,display_name as name,role,color,email,subsystem_id,created_at FROM users WHERE subsystem_id=? ORDER BY display_name ASC', [subsystemId])
      : await DB.all('SELECT id,username,display_name as name,role,color,email,subsystem_id,created_at FROM users ORDER BY display_name ASC');
    const enriched = await Promise.all(users.map(async u => {
      const taskRow = await DB.get('SELECT COUNT(*) as count FROM task_assignees WHERE member_id=?', [u.id]);
      const completedRow = await DB.get('SELECT COUNT(*) as count FROM task_assignees ta JOIN tasks t ON ta.task_id=t.id WHERE ta.member_id=? AND t.completed=1', [u.id]);
      return { ...u, taskCount: taskRow?.count||0, completedCount: completedRow?.count||0 };
    }));
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/members error:', err);
    res.status(500).json({ error: 'Failed to retrieve members' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const member = await DB.get('SELECT id,username,display_name as name,role,color,email,subsystem_id,created_at FROM users WHERE id=?', [req.params.id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (req.user.role!=='super_admin' && member.subsystem_id && member.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied: Member belongs to another subsystem' });
    }
    const taskRow = await DB.get('SELECT COUNT(*) as count FROM task_assignees WHERE member_id=?', [member.id]);
    const completedRow = await DB.get('SELECT COUNT(*) as count FROM task_assignees ta JOIN tasks t ON ta.task_id=t.id WHERE ta.member_id=? AND t.completed=1', [member.id]);
    res.json({ ...member, taskCount: taskRow?.count||0, completedCount: completedRow?.count||0 });
  } catch (err) {
    console.error('GET /api/members/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve member' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, role='member', color='#007AFF', email='', username, password, subsystem_id } = req.body;
    if (!name||!name.trim()) return res.status(400).json({ error: 'Name is required' });
    let targetSubsystem = req.user.subsystem_id || null;
    if (req.user.role==='super_admin' && subsystem_id!==undefined) targetSubsystem = subsystem_id;
    let uName = username ? username.trim() : null;
    if (!uName) {
      const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g,'');
      uName = `${sanitized||'user'}_${Math.floor(1000+Math.random()*9000)}`;
    }
    const conflict = await DB.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [uName]);
    if (conflict) uName = `${uName}_${Date.now().toString().slice(-4)}`;
    const rawPassword = password&&password.trim() ? password.trim() : uuidv4().slice(0,10);
    const passwordHash = bcrypt.hashSync(rawPassword, 10);
    const id = uuidv4();
    await DB.run('INSERT INTO users (id,username,password_hash,display_name,role,subsystem_id,color,email,must_change_password) VALUES (?,?,?,?,?,?,?,?,1)',
      [id, uName, passwordHash, name.trim(), role, targetSubsystem, color, email?email.trim():'']);
    await DB.run('INSERT OR REPLACE INTO members (id,name,role,color,email) VALUES (?,?,?,?,?)',
      [id, name.trim(), role, color, email?email.trim():'']);
    const created = await DB.get('SELECT id,username,display_name as name,role,color,email,subsystem_id,created_at FROM users WHERE id=?', [id]);
    res.status(201).json({ ...created, taskCount:0, completedCount:0 });
  } catch (err) {
    console.error('POST /api/members error:', err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const memberId = req.params.id;
    const existing = await DB.get('SELECT * FROM users WHERE id=?', [memberId]);
    if (existing && req.user.role!=='super_admin' && existing.subsystem_id && existing.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied: Member belongs to another subsystem' });
    }
    const { name, role, color, email, password } = req.body;
    if (existing) {
      if (password&&password.trim()) await DB.run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(password.trim(),10), memberId]);
      await DB.run('UPDATE users SET display_name=COALESCE(?,display_name), role=COALESCE(?,role), color=COALESCE(?,color), email=COALESCE(?,email) WHERE id=?',
        [name?name.trim():null, role, color, email!==undefined?email.trim():null, memberId]);
    }
    await DB.run(`INSERT INTO members (id,name,role,color,email) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=COALESCE(excluded.name,members.name), role=COALESCE(excluded.role,members.role), color=COALESCE(excluded.color,members.color), email=COALESCE(excluded.email,members.email)`,
      [memberId, name?name.trim():(existing?existing.display_name:'Member'), role||'member', color||'#007AFF', email?email.trim():'']);
    res.json(await DB.get('SELECT id,username,display_name as name,role,color,email,subsystem_id,created_at FROM users WHERE id=?', [memberId]));
  } catch (err) {
    console.error('PUT /api/members/:id error:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const memberId = req.params.id;
    const existing = await DB.get('SELECT * FROM users WHERE id=?', [memberId]);
    if (existing && req.user.role!=='super_admin' && existing.subsystem_id && existing.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.id===memberId) return res.status(400).json({ error: 'Cannot delete your own account' });
    await DB.run('DELETE FROM sessions WHERE user_id=?', [memberId]);
    await DB.run('DELETE FROM users WHERE id=?', [memberId]);
    await DB.run('DELETE FROM members WHERE id=?', [memberId]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/members/:id error:', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

router.get('/:id/tasks', async (req, res) => {
  try {
    const subsystemId = attachSubsystemFilter(req);
    let query = 'SELECT t.*,b.name as board_name,bk.name as bucket_name FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id JOIN boards b ON t.board_id=b.id JOIN buckets bk ON t.bucket_id=bk.id WHERE ta.member_id=?';
    const params = [req.params.id];
    if (subsystemId) { query += ' AND b.subsystem_id=?'; params.push(subsystemId); }
    query += ' ORDER BY t.due_date ASC';
    res.json(await DB.all(query, params));
  } catch (err) {
    console.error('GET /api/members/:id/tasks error:', err);
    res.status(500).json({ error: 'Failed to retrieve member tasks' });
  }
});

module.exports = router;
