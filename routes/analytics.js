/* ============================================================
   routes/analytics.js — Analytics & Calendar (async)
   ============================================================ */

const express = require('express');
const router = express.Router();
const DB = require('../database/db');
const { requireAuth, attachSubsystemFilter } = require('../middleware/auth');

router.use(requireAuth);

router.get('/overview', async (req, res) => {
  try {
    const subsystemId = attachSubsystemFilter(req);

    if (subsystemId) {
      const [totalTasks, completedTasks, overdueTasks, totalBoards, totalMembers] = await Promise.all([
        DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=?', [subsystemId]),
        DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=? AND t.completed=1', [subsystemId]),
        DB.get("SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=? AND t.due_date<date('now') AND t.completed=0", [subsystemId]),
        DB.get('SELECT COUNT(*) as count FROM boards WHERE subsystem_id=?', [subsystemId]),
        DB.get('SELECT COUNT(*) as count FROM users WHERE subsystem_id=?', [subsystemId]),
      ]);
      const [tasksByPriority, tasksByBoard, tasksByMember, dueSoon] = await Promise.all([
        DB.all('SELECT t.priority,COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=? GROUP BY t.priority', [subsystemId]),
        DB.all('SELECT b.name,b.color,COUNT(t.id) as total,SUM(CASE WHEN t.completed=1 THEN 1 ELSE 0 END) as completed FROM boards b LEFT JOIN tasks t ON b.id=t.board_id WHERE b.subsystem_id=? GROUP BY b.id', [subsystemId]),
        DB.all('SELECT u.display_name as name,u.color,COUNT(ta.task_id) as total,SUM(CASE WHEN t.completed=1 THEN 1 ELSE 0 END) as completed FROM users u LEFT JOIN task_assignees ta ON u.id=ta.member_id LEFT JOIN tasks t ON ta.task_id=t.id WHERE u.subsystem_id=? GROUP BY u.id ORDER BY total DESC', [subsystemId]),
        DB.all("SELECT t.*,b.name as board_name,bk.name as bucket_name FROM tasks t JOIN boards b ON t.board_id=b.id JOIN buckets bk ON t.bucket_id=bk.id WHERE b.subsystem_id=? AND t.due_date BETWEEN date('now') AND date('now','+7 days') AND t.completed=0 ORDER BY t.due_date ASC LIMIT 10", [subsystemId]),
      ]);
      const total = totalTasks?.count||0, completed = completedTasks?.count||0;
      return res.json({ totalTasks:total, completedTasks:completed, overdueTasks:overdueTasks?.count||0, totalBoards:totalBoards?.count||0, totalMembers:totalMembers?.count||0, completionRate:total>0?Math.round((completed/total)*100):0, tasksByPriority, tasksByBoard, tasksByMember, dueSoon, subsystemId });
    }

    // Global view
    const [totalTasks, completedTasks, overdueTasks, totalBoards, totalMembers] = await Promise.all([
      DB.get('SELECT COUNT(*) as count FROM tasks'),
      DB.get('SELECT COUNT(*) as count FROM tasks WHERE completed=1'),
      DB.get("SELECT COUNT(*) as count FROM tasks WHERE due_date<date('now') AND completed=0"),
      DB.get('SELECT COUNT(*) as count FROM boards'),
      DB.get('SELECT COUNT(*) as count FROM users'),
    ]);
    const [tasksByPriority, tasksByBoard, tasksByMember, dueSoon, subsystems] = await Promise.all([
      DB.all('SELECT priority,COUNT(*) as count FROM tasks GROUP BY priority'),
      DB.all('SELECT b.name,b.color,COUNT(t.id) as total,SUM(CASE WHEN t.completed=1 THEN 1 ELSE 0 END) as completed FROM boards b LEFT JOIN tasks t ON b.id=t.board_id GROUP BY b.id'),
      DB.all('SELECT u.display_name as name,u.color,COUNT(ta.task_id) as total,SUM(CASE WHEN t.completed=1 THEN 1 ELSE 0 END) as completed FROM users u LEFT JOIN task_assignees ta ON u.id=ta.member_id LEFT JOIN tasks t ON ta.task_id=t.id GROUP BY u.id ORDER BY total DESC'),
      DB.all("SELECT t.*,b.name as board_name,bk.name as bucket_name FROM tasks t JOIN boards b ON t.board_id=b.id JOIN buckets bk ON t.bucket_id=bk.id WHERE t.due_date BETWEEN date('now') AND date('now','+7 days') AND t.completed=0 ORDER BY t.due_date ASC LIMIT 10"),
      DB.all('SELECT * FROM subsystems ORDER BY name'),
    ]);
    const subsystemBreakdown = await Promise.all(subsystems.map(async sub => {
      const [sTasks,sCompleted,sOverdue,sBoards,sUsers] = await Promise.all([
        DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=?',[sub.id]),
        DB.get('SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=? AND t.completed=1',[sub.id]),
        DB.get("SELECT COUNT(*) as count FROM tasks t JOIN boards b ON t.board_id=b.id WHERE b.subsystem_id=? AND t.due_date<date('now') AND t.completed=0",[sub.id]),
        DB.get('SELECT COUNT(*) as count FROM boards WHERE subsystem_id=?',[sub.id]),
        DB.get('SELECT COUNT(*) as count FROM users WHERE subsystem_id=?',[sub.id]),
      ]);
      const st=sTasks?.count||0, sc=sCompleted?.count||0;
      return { id:sub.id, name:sub.name, color:sub.color, icon:sub.icon, totalTasks:st, completedTasks:sc, overdueTasks:sOverdue?.count||0, totalBoards:sBoards?.count||0, totalUsers:sUsers?.count||0, completionRate:st>0?Math.round((sc/st)*100):0 };
    }));
    const total=totalTasks?.count||0, completed=completedTasks?.count||0;
    res.json({ totalTasks:total, completedTasks:completed, overdueTasks:overdueTasks?.count||0, totalBoards:totalBoards?.count||0, totalMembers:totalMembers?.count||0, completionRate:total>0?Math.round((completed/total)*100):0, tasksByPriority, tasksByBoard, tasksByMember, dueSoon, subsystems:subsystemBreakdown, subsystemBreakdown });
  } catch (e) {
    console.error('Analytics overview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year||!month) return res.status(400).json({ error: 'year and month required' });
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month).padStart(2,'0')}-31`;
    const subsystemId = attachSubsystemFilter(req);
    let query = 'SELECT t.*,b.name as board_name,b.color as board_color,bk.name as bucket_name FROM tasks t JOIN boards b ON t.board_id=b.id JOIN buckets bk ON t.bucket_id=bk.id WHERE t.due_date BETWEEN ? AND ?';
    const params = [startDate, endDate];
    if (subsystemId) { query += ' AND b.subsystem_id=?'; params.push(subsystemId); }
    query += ' ORDER BY t.due_date ASC';
    res.json(await DB.all(query, params));
  } catch (e) {
    console.error('Calendar error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
