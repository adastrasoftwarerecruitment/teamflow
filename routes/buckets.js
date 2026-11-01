/* ============================================================
   routes/buckets.js — Buckets API (async)
   ============================================================ */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function checkBoardAccess(boardId, user) {
  const board = await DB.get('SELECT * FROM boards WHERE id = ?', [boardId]);
  if (!board) return { allowed: false, status: 404, error: 'Board not found' };
  if (user.role !== 'super_admin' && board.subsystem_id && board.subsystem_id !== user.subsystem_id) {
    return { allowed: false, status: 403, error: 'Access denied: Board belongs to another subsystem' };
  }
  return { allowed: true, board };
}

router.get('/board/:boardId', async (req, res) => {
  try {
    const access = await checkBoardAccess(req.params.boardId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    res.json(await DB.all('SELECT * FROM buckets WHERE board_id = ? ORDER BY position', [req.params.boardId]));
  } catch (err) {
    console.error('GET /api/buckets/board/:boardId error:', err);
    res.status(500).json({ error: 'Failed to retrieve buckets' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { board_id, name, color = '#007AFF' } = req.body;
    if (!board_id || !name || !name.trim()) return res.status(400).json({ error: 'board_id and name required' });
    const access = await checkBoardAccess(board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const maxRow = await DB.get('SELECT MAX(position) as maxPos FROM buckets WHERE board_id = ?', [board_id]);
    const id = uuidv4();
    await DB.run('INSERT INTO buckets (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)',
      [id, board_id, name.trim(), (maxRow?.maxPos ?? -1) + 1, color]);
    res.status(201).json(await DB.get('SELECT * FROM buckets WHERE id = ?', [id]));
  } catch (err) {
    console.error('POST /api/buckets error:', err);
    res.status(500).json({ error: 'Failed to create bucket' });
  }
});

router.put('/reorder/:boardId', async (req, res) => {
  try {
    const access = await checkBoardAccess(req.params.boardId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
    await DB.batch(order.map((id, idx) => ({
      sql: 'UPDATE buckets SET position = ? WHERE id = ? AND board_id = ?',
      args: [idx, id, req.params.boardId]
    })));
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/buckets/reorder/:boardId error:', err);
    res.status(500).json({ error: 'Failed to reorder buckets' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const bucket = await DB.get('SELECT * FROM buckets WHERE id = ?', [req.params.id]);
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    const access = await checkBoardAccess(bucket.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const { name, color } = req.body;
    await DB.run('UPDATE buckets SET name=COALESCE(?,name), color=COALESCE(?,color) WHERE id=?',
      [name?name.trim():null, color, req.params.id]);
    res.json(await DB.get('SELECT * FROM buckets WHERE id = ?', [req.params.id]));
  } catch (err) {
    console.error('PUT /api/buckets/:id error:', err);
    res.status(500).json({ error: 'Failed to update bucket' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const bucket = await DB.get('SELECT * FROM buckets WHERE id = ?', [req.params.id]);
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    const access = await checkBoardAccess(bucket.board_id, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    await DB.run('DELETE FROM buckets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/buckets/:id error:', err);
    res.status(500).json({ error: 'Failed to delete bucket' });
  }
});

module.exports = router;
