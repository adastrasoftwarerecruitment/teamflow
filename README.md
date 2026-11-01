# TeamFlow — Team Task Planner

> A Microsoft Planner-inspired local team task management application.
> Built with Node.js + Express + SQLite — no cloud, no subscription, fully yours.

---

## 🚀 Quick Start

### 1. Install dependencies (first time only)
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

### 3. Open in browser
```
http://localhost:3000
```

### 4. Share with your team (LAN)
When the server starts, it prints your **network IP** like:
```
🌐  Network: http://192.168.1.x:3000  ← Share this with your team
```
Everyone on your local network can access the app via that URL.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📋 **Boards** | Create multiple boards for different projects |
| 🗂️ **Kanban** | Drag & drop tasks between buckets (columns) |
| ✅ **Tasks** | Rich tasks with priority, due date, checklist, labels |
| 👥 **Team Members** | Add members, assign tasks, track workload |
| 📎 **Attachments** | Upload files — visible to all team members |
| 💬 **Comments** | Comment on tasks with team attribution |
| 📅 **Calendar** | Monthly calendar view of due dates |
| 📊 **Analytics** | Charts: board progress, priority breakdown, workload |
| 🔍 **Search** | Global search across all tasks (Ctrl+K) |
| 🌓 **Dark/Light** | Dark mode by default with toggle |
| 💾 **Backup** | Export all data as JSON from `/api/export` |

---

## 📁 Project Structure

```
Task_Planner/
├── server.js              # Express server entry point
├── database/db.js         # SQLite database & schema
├── routes/
│   ├── boards.js          # Boards API
│   ├── buckets.js         # Buckets (columns) API
│   ├── tasks.js           # Tasks API + checklists + labels
│   ├── members.js         # Team members API
│   ├── comments.js        # Comments API
│   ├── attachments.js     # File upload/download API
│   └── analytics.js       # Stats & calendar API
├── uploads/               # Uploaded files (auto-created)
├── data/                  # SQLite database file (auto-created)
└── public/                # Frontend
    ├── index.html
    ├── css/
    │   ├── style.css      # Design system
    │   ├── board.css      # Kanban/board styles
    │   └── modal.css      # Modal styles
    └── js/
        ├── api.js         # API client
        ├── app.js         # Main controller + routing
        ├── ui.js          # Shared UI utilities
        ├── dashboard.js   # Dashboard page
        ├── board.js       # Board + task modal
        ├── members.js     # Members page
        ├── calendar.js    # Calendar page
        └── analytics.js   # Analytics charts
```

---

## 🔒 Notes

- All data is stored locally in `data/planner.db` (SQLite)
- Uploaded files are stored in `uploads/`
- No login/authentication — designed for trusted team LAN use
- To back up, copy `data/` and `uploads/` folders, or use `/api/export`

---

## 🛠️ Run in Dev Mode (auto-restart)
```bash
npm run dev
```
