#!/usr/bin/env node
/* ============================================================
   scripts/smoke_test.js — Quick API smoke test
   Run: node scripts/smoke_test.js
   Requires server to be running on PORT (default 3000)
   ============================================================ */

require('dotenv').config();
const http = require('http');
const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

let passed = 0, failed = 0;

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: PORT,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.status || res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch(_) { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function ok(name, cond, actual) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else       { console.log(`  ❌ ${name} — got: ${JSON.stringify(actual)}`); failed++; }
}

async function run() {
  console.log(`\n🧪 TeamFlow Smoke Test — ${BASE}\n`);

  // 1. Health check
  const health = await req('GET', '/healthz');
  ok('GET /healthz → 200', health.status === 200, health.status);

  // 2. Login with wrong credentials
  const badLogin = await req('POST', '/api/auth/login', { username: 'nobody', password: 'wrong' });
  ok('POST /api/auth/login wrong creds → 401', badLogin.status === 401, badLogin.status);

  // 3. Login as admin
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!' });
  ok('POST /api/auth/login admin → 200', login.status === 200, login.status);
  if (login.status !== 200) { console.log('\n❌ Admin login failed — did you run `npm run seed` first?\n'); process.exit(1); }

  const setCookie = login.headers['set-cookie']?.[0] || '';
  const token = login.body?.token;
  const authHeader = token ? `Bearer ${token}` : null;

  function authed(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (setCookie) headers.Cookie = setCookie;
    if (authHeader) headers.Authorization = authHeader;
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : null;
      if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
      const r = http.request({ hostname:'localhost', port:PORT, path, method, headers }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => { try { resolve({ status:res.statusCode, body:JSON.parse(data) }); } catch(_) { resolve({ status:res.statusCode, body:data }); } });
      });
      r.on('error', reject);
      if (bodyStr) r.write(bodyStr);
      r.end();
    });
  }

  // 4. GET /api/auth/me
  const me = await authed('GET', '/api/auth/me');
  ok('GET /api/auth/me → 200', me.status === 200, me.status);
  const meUser = me.body?.user || me.body;
  ok('user.role === super_admin', meUser?.role === 'super_admin', meUser?.role);

  // 5. GET /api/boards
  const boards = await authed('GET', '/api/boards');
  ok('GET /api/boards → 200', boards.status === 200, boards.status);

  // 6. POST /api/boards
  const newBoard = await authed('POST', '/api/boards', { name: 'Smoke Test Board', icon: '🧪' });
  ok('POST /api/boards → 201', newBoard.status === 201, newBoard.status);
  const boardId = newBoard.body?.id;

  // 7. GET /api/members
  const members = await authed('GET', '/api/members');
  ok('GET /api/members → 200', members.status === 200, members.status);

  // 8. GET /api/analytics/overview
  const analytics = await authed('GET', '/api/analytics/overview');
  ok('GET /api/analytics/overview → 200', analytics.status === 200, analytics.status);

  // 9. GET /api/notifications
  const notifs = await authed('GET', '/api/notifications');
  ok('GET /api/notifications → 200', notifs.status === 200, notifs.status);

  // 10. GET /api/subsystems
  const subs = await authed('GET', '/api/subsystems');
  ok('GET /api/subsystems → 200', subs.status === 200, subs.status);

  // 11. POST board bucket task
  if (boardId) {
    const bktsRes = await authed('GET', `/api/buckets/board/${boardId}`);
    ok(`GET /api/buckets/board/${boardId} → 200`, bktsRes.status === 200, bktsRes.status);
    const bucketId = bktsRes.body?.[0]?.id;
    if (bucketId) {
      const taskRes = await authed('POST', '/api/tasks', { board_id:boardId, bucket_id:bucketId, title:'Smoke task', priority:'low' });
      ok('POST /api/tasks → 201', taskRes.status === 201, taskRes.status);
    }
    // Cleanup
    await authed('DELETE', `/api/boards/${boardId}`);
  }

  // 12. Logout
  const logout = await authed('POST', '/api/auth/logout');
  ok('POST /api/auth/logout → 200', logout.status === 200, logout.status);

  // 13. Verify session destroyed
  const afterLogout = await req('GET', '/api/boards');
  ok('GET /api/boards after logout → 401', afterLogout.status === 401, afterLogout.status);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
  if (failed === 0) console.log('  🎉 All smoke tests passed!\n');
  else { console.log('  ⚠️  Some tests failed. See above.\n'); process.exit(1); }
}

run().catch(err => { console.error('Smoke test error:', err.message); process.exit(1); });
