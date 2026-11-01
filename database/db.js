/* ============================================================
   database/db.js — Dual-mode database: Turso (libSQL) or local SQLite
   
   Config:
     TURSO_DATABASE_URL + TURSO_AUTH_TOKEN  → Turso cloud
     (unset)                                 → local file:./data/planner.db
   
   Exports async helpers: all, get, run, batch, transaction
   ============================================================ */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const TURSO_URL = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;
const USE_TURSO = !!TURSO_URL;
let db; // will hold the driver instance

/* ── Helper to generate a random password ────────────────────── */
function randomPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ── Unified async API ───────────────────────────────────────── */
const DB = {
  /**
   * Execute a query returning all rows as an array of plain objects.
   */
  async all(sql, args = []) {
    if (USE_TURSO) {
      const rs = await db.execute({ sql, args });
      return rs.rows.map(row => rowToObj(row, rs.columns));
    } else {
      return db.prepare(sql).all(...args);
    }
  },

  /**
   * Execute a query returning the first row or undefined.
   */
  async get(sql, args = []) {
    if (USE_TURSO) {
      const rs = await db.execute({ sql, args });
      if (!rs.rows.length) return undefined;
      return rowToObj(rs.rows[0], rs.columns);
    } else {
      return db.prepare(sql).get(...args);
    }
  },

  /**
   * Execute a DML statement, return { changes, lastInsertRowid }.
   */
  async run(sql, args = []) {
    if (USE_TURSO) {
      const rs = await db.execute({ sql, args });
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid };
    } else {
      return db.prepare(sql).run(...args);
    }
  },

  /**
   * Execute multiple statements in one batch (Turso) or a transaction (local).
   * stmts: Array of { sql, args }
   */
  async batch(stmts) {
    if (USE_TURSO) {
      return db.batch(stmts.map(s => ({ sql: s.sql, args: s.args || [] })));
    } else {
      const run = db.transaction(() => {
        return stmts.map(s => db.prepare(s.sql).run(...(s.args || [])));
      });
      return run();
    }
  },
};

/* ── Turso row → plain JS object ─────────────────────────────── */
function rowToObj(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

/* ── Initialise the driver ───────────────────────────────────── */
async function initDriver() {
  if (USE_TURSO) {
    const { createClient } = require('@libsql/client');
    db = createClient({
      url: TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log('📡 Connected to Turso cloud database');
  } else {
    // Local SQLite via better-sqlite3 (optional dependency)
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (e) {
      throw new Error(
        'better-sqlite3 is not available (failed to build or not installed). ' +
        'Set TURSO_URL + TURSO_AUTH_TOKEN to use Turso cloud instead, ' +
        'or run: npm install better-sqlite3'
      );
    }
    const DB_PATH = path.join(__dirname, '..', 'data', 'planner.db');
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log(`💾 Using local SQLite: ${DB_PATH}`);
  }
}

/* ── Schema migrations (idempotent) ──────────────────────────── */
const SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS subsystems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    icon TEXT DEFAULT '🏢',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    subsystem_id TEXT,
    color TEXT DEFAULT '#6366f1',
    email TEXT DEFAULT '',
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (subsystem_id) REFERENCES subsystems(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Member',
    color TEXT DEFAULT '#6366f1',
    email TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    icon TEXT DEFAULT '📋',
    subsystem_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS buckets (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    bucket_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    due_date TEXT DEFAULT NULL,
    position INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    created_by TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    PRIMARY KEY (task_id, member_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS task_labels (
    task_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    PRIMARY KEY (task_id, label_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS checklists (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    member_id TEXT,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT DEFAULT '',
    uploaded_by TEXT DEFAULT 'Unknown',
    data BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    board_id TEXT,
    task_id TEXT,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    actor TEXT DEFAULT 'Unknown',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS device_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    platform TEXT DEFAULT 'android',
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    task_id TEXT,
    board_id TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT PRIMARY KEY,
    assigned INTEGER DEFAULT 1,
    comments INTEGER DEFAULT 1,
    due_soon INTEGER DEFAULT 1,
    status_changes INTEGER DEFAULT 1,
    push_enabled INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS reminder_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    reminder_date TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, task_id, reminder_date, type)
  )`,
];

/* ── ALTER TABLE migrations (idempotent — errors are ignored) ── */
const ALTER_STMTS = [
  "ALTER TABLE boards ADD COLUMN subsystem_id TEXT",
  "ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0",
  "ALTER TABLE attachments ADD COLUMN data BLOB",
  "ALTER TABLE tasks ADD COLUMN created_by TEXT DEFAULT NULL",
];

async function runSchema() {
  for (const sql of SCHEMA_STMTS) {
    await DB.run(sql);
  }
  for (const sql of ALTER_STMTS) {
    try { await DB.run(sql); } catch (e) { /* column already exists */ }
  }
}

/* ── Bootstrap admin if no users exist ───────────────────────── */
async function bootstrapAdmin() {
  const row = await DB.get('SELECT COUNT(*) as count FROM users');
  const count = row ? (row.count || 0) : 0;
  if (count > 0) return;

  let adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  let printed = false;
  if (!adminPassword) {
    adminPassword = randomPassword(12);
    printed = true;
  }

  const adminId = uuidv4();
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  await DB.run(
    `INSERT INTO users (id, username, password_hash, display_name, role, subsystem_id, color, email, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [adminId, 'admin', passwordHash, 'Administrator', 'super_admin', null, '#007AFF', 'admin@teamflow.local', 1]
  );

  // Shadow members row
  await DB.run(
    `INSERT OR IGNORE INTO members (id, name, role, color, email) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'Administrator', 'super_admin', '#007AFF', 'admin@teamflow.local']
  );

  if (printed) {
    console.log('\n' + '═'.repeat(60));
    console.log('🔐 FIRST-RUN ADMIN CREDENTIALS (save these now!)');
    console.log('   Username: admin');
    console.log(`   Password: ${adminPassword}`);
    console.log('   You will be required to change this password on first login.');
    console.log('═'.repeat(60) + '\n');
  } else {
    console.log('🌱 Admin account created with ADMIN_INITIAL_PASSWORD (must change on first login)');
  }
}

/* ── Public init function (called from server.js) ────────────── */
async function initDB() {
  await initDriver();
  await runSchema();
  await bootstrapAdmin();
  console.log('✅ Database ready');
}

/* Expose sync-compatible db instance for routes that haven't been
   converted yet (local-dev only — Turso path always uses DB.*) */
DB.getRawDriver = () => db;
DB.initDB = initDB;

module.exports = DB;
