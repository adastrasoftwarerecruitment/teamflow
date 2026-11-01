/* ============================================================
   server.js — TeamFlow Express server
   ============================================================ */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');
const cookieParser = require('cookie-parser');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const DB = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Security headers ────────────────────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Capacitor loading
}));

/* ── CORS allowlist ──────────────────────────────────────────── */
const ALWAYS_ALLOWED = [
  'http://localhost',
  'http://localhost:3000',
  'https://localhost',
  'capacitor://localhost',
];
const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];
const allowedOrigins = new Set([...ALWAYS_ALLOWED, ...envOrigins]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman) or matched origins
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ── Body parsers ────────────────────────────────────────────── */
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Static frontend ─────────────────────────────────────────── */
// Note: /uploads static route is REMOVED (attachments served via /api/attachments/:id/download)
app.use(express.static(path.join(__dirname, 'public')));

/* ── API Routes ──────────────────────────────────────────────── */
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/subsystems',    require('./routes/subsystems'));
app.use('/api/boards',        require('./routes/boards'));
app.use('/api/buckets',       require('./routes/buckets'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/members',       require('./routes/members'));
app.use('/api/comments',      require('./routes/comments'));
app.use('/api/attachments',   require('./routes/attachments'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));

/* ── Health check (for cron-job.org ping to prevent Render sleep) */
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

/* ── Data export backup — Super Admin only ───────────────────── */
app.get('/api/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = {
      exportedAt: new Date().toISOString(),
      subsystems:    await DB.all('SELECT * FROM subsystems'),
      users:         await DB.all('SELECT id,username,display_name,role,subsystem_id,color,email,created_at FROM users'),
      boards:        await DB.all('SELECT * FROM boards'),
      buckets:       await DB.all('SELECT * FROM buckets'),
      members:       await DB.all('SELECT * FROM members'),
      tasks:         await DB.all('SELECT * FROM tasks'),
      task_assignees:await DB.all('SELECT * FROM task_assignees'),
      labels:        await DB.all('SELECT * FROM labels'),
      task_labels:   await DB.all('SELECT * FROM task_labels'),
      checklists:    await DB.all('SELECT * FROM checklists'),
      comments:      await DB.all('SELECT * FROM comments'),
      attachments:   await DB.all('SELECT id,task_id,filename,original_name,file_size,mime_type,uploaded_by,created_at FROM attachments'),
    };
    res.setHeader('Content-Disposition', `attachment; filename="teamflow-backup-${Date.now()}.json"`);
    res.json(data);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export backup data' });
  }
});

/* ── SPA catch-all ───────────────────────────────────────────── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Error handler ───────────────────────────────────────────── */
app.use((err, req, res, next) => {
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ── Start ───────────────────────────────────────────────────── */
async function start() {
  await DB.initDB();

  const { startScheduler } = require('./services/scheduler');
  startScheduler();

  if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
      const interfaces = os.networkInterfaces();
      console.log('\n🚀 TeamFlow is running!');
      console.log('─'.repeat(50));
      console.log(`  Local:   http://localhost:${PORT}`);
      Object.values(interfaces).flat().forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  Network: http://${iface.address}:${PORT}`);
        }
      });
      console.log('─'.repeat(50));
      console.log('  Press Ctrl+C to stop\n');
    });
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
module.exports.ready = start;
