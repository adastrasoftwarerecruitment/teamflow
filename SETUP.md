# TeamFlow — Manual Setup Guide

## Status: Backend ✅ · Android Scaffold ✅ · Server Tests: 15/15 ✅

---

## What was done automatically

| Step | Status |
|------|--------|
| Audit all files, fix missing routes | ✅ |
| DB rewrite (async, Turso dual-mode) | ✅ |
| Auth (rate-limit, 30-day sessions, change-password) | ✅ |
| All API routes (boards, tasks, members, comments, attachments, analytics, notifications, subsystems) | ✅ |
| Push notification service (FCM + in-app) | ✅ |
| Hourly cron reminder scheduler | ✅ |
| iOS-style CSS design system | ✅ |
| Bottom tab bar + Notifications page + Me/Settings page | ✅ |
| Capacitor config + `cap add android` | ✅ |
| Seed script + Smoke tests (15/15 ✅) | ✅ |

---

## Manual steps (only you can do these)

### Step 1 — Create a Turso cloud database (free)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create teamflow

# Get connection URL and token
turso db show teamflow --url
turso db tokens create teamflow
```

Add to your `.env`:
```
TURSO_URL=libsql://teamflow-<yourname>.turso.io
TURSO_AUTH_TOKEN=<token>
```

---

### Step 2 — Create a Firebase project for push notifications

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it `TeamFlow`
2. **Project Settings → Service Accounts → Generate new private key** → download JSON
3. Rename it `firebase-service-account.json` and place it in the project root
4. Also go to **Project Settings → General → Your apps → Add app → Android**
   - Package name: `com.teamflow.app`
   - Download `google-services.json`
   - Place it at `android/app/google-services.json`

Add to `.env`:
```
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

---

### Step 3 — Deploy API to Render.com (free tier)

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo
3. Or use **Blueprint** — just click **Deploy** with the included `render.yaml`
4. In the Render dashboard → **Environment** tab, set:
   - `TURSO_URL` — from Step 1
   - `TURSO_AUTH_TOKEN` — from Step 1
   - `SESSION_SECRET` — generate at: `openssl rand -hex 32`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire JSON as a single line
   - `CORS_ORIGINS` — `https://your-app.onrender.com`
5. Note your Render URL: `https://teamflow-api.onrender.com`

---

### Step 4 — Point the Android app at your deployed API

Edit `public/js/config.js`:
```js
window.__TEAMFLOW_API = 'https://teamflow-api.onrender.com'; // your Render URL
```

Then re-sync:
```bash
npm run cap:sync
```

---

### Step 5 — Build and install the Android APK

**Prerequisites:** Android Studio + JDK 17 installed

```bash
# Open in Android Studio
npm run cap:open

# In Android Studio:
# 1. Wait for Gradle sync to finish
# 2. Build → Build Bundle(s)/APK(s) → Build APK(s)
# 3. Install on device:
#    adb install app/build/outputs/apk/debug/app-debug.apk
```

Or run directly on connected device:
```bash
npm run cap:run
```

---

### Step 6 — Set up keep-alive ping (prevents Render free tier sleep)

1. Go to [cron-job.org](https://cron-job.org) → create free account
2. Add a job: `GET https://teamflow-api.onrender.com/healthz` every **10 minutes**

---

### Step 7 — Run seed on production

After deploying to Render, hit the seed endpoint or SSH in and run:
```bash
SEED_ADMIN_PASSWORD=YourSecurePassword node scripts/seed.js
```

Default login after seed:
- **Admin:** `admin` / `AdminPass123!` (or your `SEED_ADMIN_PASSWORD`)
- **Demo:**  `demo` / `Demo1234!`

> Both users have `must_change_password=1` — they will be forced to set a new password on first login.

---

## Local development (works right now, no Turso needed)

```bash
npm install
npm run seed          # create admin + demo data
npm run dev           # start with nodemon
# Open http://localhost:3000
```

---

## Run smoke tests

```bash
# In one terminal:
npm run dev

# In another terminal:
npm run test
```

---

## Architecture decisions (see DECISIONS.md for full list)

| Decision | Choice | Reason |
|----------|--------|--------|
| Cloud DB | Turso (free) | libSQL-compatible, global replicas, generous free tier |
| Hosting | Render.com | Free tier, zero-config, no credit card needed |
| Push | Firebase FCM | Free, Android + iOS, industry standard |
| Session | Cookie + Bearer token | Cookie for web, token for Capacitor native context |
| Attachments | DB BLOB (5 MB max) | No disk needed on ephemeral cloud hosts |
| Android wrapper | Capacitor 8 | Official, minimal config, works with vanilla JS |
