# TeamFlow — Security & Architecture Audit

**Date:** 2026-11-01  
**Auditor:** Antigravity AI  
**Scope:** Full codebase review before production upgrade

---

## 1. Files Audited

| File | Status |
|------|--------|
| server.js | Reviewed |
| database/db.js | Reviewed |
| middleware/auth.js | Reviewed |
| routes/auth.js | Reviewed |
| routes/subsystems.js | Reviewed |
| routes/boards.js | Reviewed |
| routes/buckets.js | Reviewed |
| routes/tasks.js | Reviewed |
| routes/members.js | Reviewed |
| routes/comments.js | Reviewed |
| routes/attachments.js | Reviewed |
| routes/analytics.js | Reviewed |
| public/js/api.js | Reviewed |
| public/js/app.js | Reviewed |
| public/js/dashboard.js | Reviewed |
| public/js/analytics.js | Reviewed |
| public/js/admin.js | Reviewed |
| public/js/members.js | Reviewed |
| public/js/board.js | Reviewed |
| public/js/calendar.js | Reviewed |
| public/js/ui.js | Reviewed |
| public/index.html | Reviewed |
| public/sw.js | Reviewed |
| README.md | Reviewed |

---

## 2. Discrepancy: Brief vs Reality

> The mission brief stated routes/auth.js, routes/members.js, and routes/analytics.js were **missing**. They are NOT missing — all three exist and are functionally correct. This was likely based on an earlier state of the repo.

---

## 3. Security Defects

### 🔴 Critical

| ID | File | Issue | Fix Applied |
|----|------|-------|-------------|
| S1 | database/db.js:176-188 | Hardcoded `admin123` password seeded on first run | Use env `ADMIN_INITIAL_PASSWORD` or random printed password |
| S2 | server.js:12 | `cors()` called with no options — allows ALL origins with credentials | CORS allowlist from env CORS_ORIGINS |
| S3 | server.js:21 | `/uploads` served as static, unauthenticated — anyone with a filename can download any attachment | Remove entirely; serve via /api/attachments/:id/download (already auth-gated) |

### 🟡 High

| ID | File | Issue | Fix Applied |
|----|------|-------|-------------|
| S4 | routes/auth.js | No rate limiting on login — brute-force possible | express-rate-limit: 10/15min/IP |
| S5 | server.js | No helmet — missing security headers (CSP, HSTS, etc.) | Add helmet() |
| S6 | routes/comments.js:54 | Client can send `member_id` in body to impersonate another user | Always use req.user.id as member_id |

### 🟡 Medium

| ID | File | Issue | Fix Applied |
|----|------|-------|-------------|
| S7 | database/db.js | No `must_change_password` column — no way to force new users to change password | Add column, enforce in login flow |
| S8 | routes/auth.js:8 | Session duration = 7 days (spec says 30) | Change to 30 days |
| S9 | routes/attachments.js | Files stored on disk (`uploads/`) — ephemeral on Render; also no per-file access logging | Switch to BLOB column in DB |
| S10 | routes/attachments.js:81 | `uploaded_by` read from `req.body` — client can spoof | Use req.user.display_name |

---

## 4. Architecture Defects

| ID | Issue | Fix Applied |
|----|-------|-------------|
| A1 | `better-sqlite3` is synchronous — blocks event loop; not compatible with Turso cloud | Migrate to @libsql/client (async); keep better-sqlite3 as local fallback |
| A2 | No push notification infrastructure | firebase-admin + device_tokens + notifications tables + node-cron scheduler |
| A3 | No Capacitor wrapping for Android | Add @capacitor/* packages, capacitor.config.json, android/ dir |
| A4 | api.js uses relative URLs only — won't work in Capacitor native context | Add config.js with API_BASE; store token via Capacitor.Preferences |
| A5 | Service worker registers unconditionally — conflicts with Capacitor | Skip SW registration when window.Capacitor?.isNativePlatform() |
| A6 | No `/healthz` endpoint for uptime monitoring | Add GET /healthz |
| A7 | `/api/export` uses sync db.prepare — needs async update | Convert to async |

---

## 5. What Was Correct / Already Implemented Well

- ✅ Session-based auth with `tf_session` cookie + Bearer token header support
- ✅ Subsystem isolation enforced in ALL routes (boards, tasks, comments, attachments, members, analytics)
- ✅ Shadow `members` table kept in sync with `users` — task assignees work correctly
- ✅ `requireAuth` / `requireAdmin` middleware properly checks roles
- ✅ `attachSubsystemFilter` helper correctly scopes queries for regular users vs super_admin
- ✅ Task assignee → member_id FK properly maintained via users table
- ✅ No SQL injection (all parameterized queries)
- ✅ bcryptjs used for all passwords
- ✅ Cascade deletes configured on all relevant FKs
- ✅ Activity logging in `activity_log` table
- ✅ Subsystem isolation in `routes/subsystems.js` properly mirrors users ↔ members

---

## 6. README Status

**Outdated:** README.md states "No login/authentication — designed for trusted team LAN use". Authentication has already been implemented. README replaced as part of this upgrade.
