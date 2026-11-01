/* ============================================================
   routes/attachments.js — Attachments stored as BLOB in DB
   5 MB max per file, served via authenticated download endpoint
   ============================================================ */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

async function checkTaskAccess(taskId, user) {
  const task = await DB.get('SELECT t.*,b.subsystem_id FROM tasks t JOIN boards b ON t.board_id=b.id WHERE t.id=?', [taskId]);
  if (!task) return { allowed: false, status: 404, error: 'Task not found' };
  if (user.role!=='super_admin' && task.subsystem_id && task.subsystem_id!==user.subsystem_id) {
    return { allowed: false, status: 403, error: 'Access denied' };
  }
  return { allowed: true, task };
}

// GET /api/attachments/task/:taskId — metadata only (no BLOB)
router.get('/task/:taskId', async (req, res) => {
  try {
    const access = await checkTaskAccess(req.params.taskId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    const attachments = await DB.all(
      'SELECT id,task_id,filename,original_name,file_size,mime_type,uploaded_by,created_at FROM attachments WHERE task_id=? ORDER BY created_at DESC',
      [req.params.taskId]);
    res.json(attachments);
  } catch (err) {
    console.error('GET /api/attachments/task/:taskId error:', err);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

// POST /api/attachments/upload/:taskId
router.post('/upload/:taskId', async (req, res, next) => {
  try {
    const access = await checkTaskAccess(req.params.taskId, req.user);
    if (!access.allowed) return res.status(access.status).json({ error: access.error });
    next();
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
}, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const uploadedBy = req.user.display_name || req.user.username; // server-side identity
    const inserted = [];
    for (const file of req.files) {
      if (file.size > MAX_FILE_SIZE) return res.status(400).json({ error: `File "${file.originalname}" exceeds 5 MB limit` });
      const id = uuidv4();
      await DB.run('INSERT INTO attachments (id,task_id,filename,original_name,file_size,mime_type,uploaded_by,data) VALUES (?,?,?,?,?,?,?,?)',
        [id, req.params.taskId, id, file.originalname, file.size, file.mimetype, uploadedBy, file.buffer]);
      inserted.push(await DB.get('SELECT id,task_id,filename,original_name,file_size,mime_type,uploaded_by,created_at FROM attachments WHERE id=?', [id]));
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error('POST /api/attachments/upload error:', err);
    res.status(500).json({ error: 'Failed to upload attachments' });
  }
});

// GET /api/attachments/:id/download — authenticated, subsystem-checked
router.get('/:id/download', async (req, res) => {
  try {
    const attachment = await DB.get('SELECT a.*,b.subsystem_id FROM attachments a JOIN tasks t ON a.task_id=t.id JOIN boards b ON t.board_id=b.id WHERE a.id=?', [req.params.id]);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (req.user.role!=='super_admin' && attachment.subsystem_id && attachment.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!attachment.data) return res.status(404).json({ error: 'File data not found' });
    res.setHeader('Content-Disposition', `inline; filename="${attachment.original_name}"`);
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.file_size);
    res.send(attachment.data);
  } catch (err) {
    console.error('GET /api/attachments/:id/download error:', err);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// DELETE /api/attachments/:id
router.delete('/:id', async (req, res) => {
  try {
    const attachment = await DB.get('SELECT a.*,b.subsystem_id FROM attachments a JOIN tasks t ON a.task_id=t.id JOIN boards b ON t.board_id=b.id WHERE a.id=?', [req.params.id]);
    if (!attachment) return res.status(404).json({ error: 'Not found' });
    if (req.user.role!=='super_admin' && attachment.subsystem_id && attachment.subsystem_id!==req.user.subsystem_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await DB.run('DELETE FROM attachments WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/attachments/:id error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;
