/* ============================================================
   routes/subsystems.js — Subsystem & User management (async, super_admin only)
   ============================================================ */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const subsystems = await DB.all('SELECT * FROM subsystems ORDER BY created_at DESC');
    const result = await Promise.all(subsystems.map(async sub => {
      const [uc,bc,tc] = await Promise.all([
        DB.get('SELECT COUNT(*) as count FROM users WHERE subsystem_id=?',[sub.id]),
        DB.get('SELECT COUNT(*) as count FROM boards WHERE subsystem_id=?',[sub.id]),
        DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=?',[sub.id]),
      ]);
      return { ...sub, userCount:uc?.count||0, boardCount:bc?.count||0, taskCount:tc?.count||0 };
    }));
    res.json(result);
  } catch (err) {
    console.error('List subsystems error:', err);
    res.status(500).json({ error: 'Failed to retrieve subsystems' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description='', color='#007AFF', icon='🏢' } = req.body;
    if (!name||!name.trim()) return res.status(400).json({ error: 'Subsystem name is required' });
    const id = uuidv4();
    await DB.run('INSERT INTO subsystems (id,name,description,color,icon) VALUES (?,?,?,?,?)',
      [id, name.trim(), description.trim(), color, icon]);
    const created = await DB.get('SELECT * FROM subsystems WHERE id=?', [id]);
    res.status(201).json({ ...created, userCount:0, boardCount:0, taskCount:0 });
  } catch (err) {
    console.error('Create subsystem error:', err);
    res.status(500).json({ error: 'Failed to create subsystem' });
  }
});

// POST /api/subsystems/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const userId = req.params.id;
    const existing = await DB.get('SELECT id FROM users WHERE id=?', [userId]);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const { tempPassword } = req.body;
    const newPassword = tempPassword&&tempPassword.trim() ? tempPassword.trim() : uuidv4().slice(0,10);
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await DB.run('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?', [passwordHash, userId]);
    res.json({ success:true, tempPassword:newPassword, message:'Password reset. User must change on next login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PUT /api/subsystems/users/:id  (must be before /:id)
router.put('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const existing = await DB.get('SELECT * FROM users WHERE id=?', [userId]);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const { username, password, display_name, role, subsystem_id, color, email } = req.body;
    if (username && username.trim().toLowerCase()!==existing.username.toLowerCase()) {
      const conflict = await DB.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id!=?', [username.trim(), userId]);
      if (conflict) return res.status(400).json({ error: 'Username is already taken' });
    }
    const targetSubsystem = subsystem_id!==undefined ? subsystem_id : existing.subsystem_id;
    if (targetSubsystem) {
      const subExists = await DB.get('SELECT id FROM subsystems WHERE id=?', [targetSubsystem]);
      if (!subExists) return res.status(400).json({ error: 'Specified subsystem does not exist' });
    }
    let passwordHash = existing.password_hash;
    if (password&&password.trim()) passwordHash = bcrypt.hashSync(password.trim(), 10);
    const newUsername = username?username.trim():existing.username;
    const newDisplayName = display_name?display_name.trim():existing.display_name;
    const newRole = role!==undefined?role:existing.role;
    const newColor = color!==undefined?color:existing.color;
    const newEmail = email!==undefined?email.trim():existing.email;
    await DB.run('UPDATE users SET username=?,password_hash=?,display_name=?,role=?,subsystem_id=?,color=?,email=? WHERE id=?',
      [newUsername, passwordHash, newDisplayName, newRole, targetSubsystem, newColor, newEmail, userId]);
    await DB.run('INSERT INTO members (id,name,role,color,email) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,color=excluded.color,email=excluded.email',
      [userId, newDisplayName, newRole, newColor, newEmail]);
    const updated = await DB.get('SELECT u.id,u.username,u.display_name,u.role,u.subsystem_id,u.color,u.email,u.created_at,s.name as subsystem_name,s.color as subsystem_color,s.icon as subsystem_icon FROM users u LEFT JOIN subsystems s ON u.subsystem_id=s.id WHERE u.id=?', [userId]);
    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/subsystems/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id===userId) return res.status(400).json({ error: 'Cannot delete your own user account' });
    const existing = await DB.get('SELECT id FROM users WHERE id=?', [userId]);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    await DB.run('DELETE FROM sessions WHERE user_id=?', [userId]);
    await DB.run('DELETE FROM users WHERE id=?', [userId]);
    await DB.run('DELETE FROM members WHERE id=?', [userId]);
    res.json({ success:true, message:'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sub = await DB.get('SELECT * FROM subsystems WHERE id=?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
    const [uc,bc,tc] = await Promise.all([
      DB.get('SELECT COUNT(*) as count FROM users WHERE subsystem_id=?',[sub.id]),
      DB.get('SELECT COUNT(*) as count FROM boards WHERE subsystem_id=?',[sub.id]),
      DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=?',[sub.id]),
    ]);
    res.json({ ...sub, userCount:uc?.count||0, boardCount:bc?.count||0, taskCount:tc?.count||0 });
  } catch (err) {
    console.error('Get subsystem error:', err);
    res.status(500).json({ error: 'Failed to retrieve subsystem' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const sub = await DB.get('SELECT * FROM subsystems WHERE id=?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
    const { name, description, color, icon } = req.body;
    await DB.run('UPDATE subsystems SET name=COALESCE(?,name),description=COALESCE(?,description),color=COALESCE(?,color),icon=COALESCE(?,icon) WHERE id=?',
      [name?name.trim():null, description!==undefined?description.trim():null, color, icon, req.params.id]);
    res.json(await DB.get('SELECT * FROM subsystems WHERE id=?', [req.params.id]));
  } catch (err) {
    console.error('Update subsystem error:', err);
    res.status(500).json({ error: 'Failed to update subsystem' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const sub = await DB.get('SELECT id FROM subsystems WHERE id=?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
    const subsystemId = req.params.id;
    const boards = await DB.all('SELECT id FROM boards WHERE subsystem_id=?', [subsystemId]);
    for (const b of boards) await DB.run('DELETE FROM boards WHERE id=?', [b.id]);
    await DB.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE subsystem_id=?)', [subsystemId]);
    await DB.run('DELETE FROM members WHERE id IN (SELECT id FROM users WHERE subsystem_id=?)', [subsystemId]);
    await DB.run('DELETE FROM users WHERE subsystem_id=?', [subsystemId]);
    await DB.run('DELETE FROM subsystems WHERE id=?', [subsystemId]);
    res.json({ success:true, message:'Subsystem and all associated resources deleted' });
  } catch (err) {
    console.error('Delete subsystem error:', err);
    res.status(500).json({ error: 'Failed to delete subsystem' });
  }
});

router.get('/:id/users', async (req, res) => {
  try {
    const sub = await DB.get('SELECT id FROM subsystems WHERE id=?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
    const users = await DB.all('SELECT id,username,display_name,role,subsystem_id,color,email,created_at FROM users WHERE subsystem_id=? ORDER BY display_name ASC', [req.params.id]);
    res.json(users);
  } catch (err) {
    console.error('List subsystem users error:', err);
    res.status(500).json({ error: 'Failed to retrieve subsystem users' });
  }
});

router.post('/:id/users', async (req, res) => {
  try {
    const sub = await DB.get('SELECT id FROM subsystems WHERE id=?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
    const { username, password, display_name, role='member', color='#007AFF', email='' } = req.body;
    if (!username||!username.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password||!password.trim()) return res.status(400).json({ error: 'Password is required' });
    if (!display_name||!display_name.trim()) return res.status(400).json({ error: 'Display name is required' });
    const existing = await DB.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [username.trim()]);
    if (existing) return res.status(400).json({ error: 'Username is already taken' });
    const userId = uuidv4();
    const passwordHash = bcrypt.hashSync(password.trim(), 10);
    await DB.run('INSERT INTO users (id,username,password_hash,display_name,role,subsystem_id,color,email,must_change_password) VALUES (?,?,?,?,?,?,?,?,1)',
      [userId, username.trim(), passwordHash, display_name.trim(), role, req.params.id, color, email.trim()]);
    await DB.run('INSERT OR REPLACE INTO members (id,name,role,color,email) VALUES (?,?,?,?,?)',
      [userId, display_name.trim(), role, color, email.trim()]);
    const created = await DB.get('SELECT id,username,display_name,role,subsystem_id,color,email,created_at FROM users WHERE id=?', [userId]);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create subsystem user error:', err);
    res.status(500).json({ error: 'Failed to create user in subsystem' });
  }
});

module.exports = router;
