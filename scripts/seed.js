#!/usr/bin/env node
/* ============================================================
   scripts/seed.js — Creates default admin + demo data
   Run: node scripts/seed.js
   ============================================================ */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const DB = require('../database/db');

async function seed() {
  console.log('🌱 Seeding TeamFlow database...');
  await DB.initDB();

  // ── Super Admin ──────────────────────────────────────────
  const existing = await DB.get("SELECT id FROM users WHERE username='admin'");
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!';
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const adminId = uuidv4();

  if (!existing) {
    await DB.run(
      'INSERT INTO users (id,username,password_hash,display_name,role,color,email,must_change_password) VALUES (?,?,?,?,?,?,?,0)',
      [adminId, 'admin', adminHash, 'System Admin', 'super_admin', '#007AFF', 'admin@teamflow.local']
    );
    await DB.run('INSERT OR REPLACE INTO members (id,name,role,color,email) VALUES (?,?,?,?,?)',
      [adminId, 'System Admin', 'super_admin', '#007AFF', 'admin@teamflow.local']);
    console.log(`  ✅ Super admin created: admin / ${adminPassword}`);
  } else {
    console.log('  ⏭  Super admin already exists, skipping');
  }

  // ── Demo Subsystem ───────────────────────────────────────
  let subsystem = await DB.get("SELECT id FROM subsystems WHERE name='Engineering'");
  if (!subsystem) {
    const subId = uuidv4();
    await DB.run('INSERT INTO subsystems (id,name,description,color,icon) VALUES (?,?,?,?,?)',
      [subId, 'Engineering', 'Software engineering team', '#007AFF', '⚙️']);
    subsystem = { id: subId };
    console.log('  ✅ Demo subsystem: Engineering');
  }

  // ── Demo User ────────────────────────────────────────────
  const demoUser = await DB.get("SELECT id FROM users WHERE username='demo'");
  if (!demoUser) {
    const demoId = uuidv4();
    const demoHash = bcrypt.hashSync('Demo1234!', 10);
    await DB.run('INSERT INTO users (id,username,password_hash,display_name,role,subsystem_id,color,must_change_password) VALUES (?,?,?,?,?,?,?,0)',
      [demoId, 'demo', demoHash, 'Demo User', 'member', subsystem.id, '#34C759']);
    await DB.run('INSERT OR REPLACE INTO members (id,name,role,color,email) VALUES (?,?,?,?,?)',
      [demoId, 'Demo User', 'member', '#34C759', '']);
    console.log('  ✅ Demo user created: demo / Demo1234!');
  }

  // ── Demo Board ───────────────────────────────────────────
  const board = await DB.get("SELECT id FROM boards WHERE name='Sprint 1'");
  if (!board) {
    const boardId = uuidv4();
    await DB.run('INSERT INTO boards (id,name,description,color,icon,subsystem_id) VALUES (?,?,?,?,?,?)',
      [boardId, 'Sprint 1', 'First sprint board', '#007AFF', '🚀', subsystem.id]);

    const bucketNames = ['To Do', 'In Progress', 'In Review', 'Done'];
    for (let i = 0; i < bucketNames.length; i++) {
      await DB.run('INSERT INTO buckets (id,board_id,name,position) VALUES (?,?,?,?)',
        [uuidv4(), boardId, bucketNames[i], i]);
    }

    const todoBucket = await DB.get("SELECT id FROM buckets WHERE board_id=? AND name='To Do'", [boardId]);
    if (todoBucket) {
      const taskId = uuidv4();
      await DB.run('INSERT INTO tasks (id,board_id,bucket_id,title,description,priority,due_date,position) VALUES (?,?,?,?,?,?,?,?)',
        [taskId, boardId, todoBucket.id, 'Set up project structure', 'Define folder layout and architecture', 'high', new Date(Date.now()+7*86400000).toISOString().slice(0,10), 0]);
      console.log('  ✅ Demo board: Sprint 1 with sample task');
    }
  }

  console.log('\n🎉 Seed complete!');
  console.log('  Login: admin / ' + adminPassword);
  console.log('  Demo:  demo  / Demo1234!\n');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
