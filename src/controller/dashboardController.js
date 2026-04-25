/**
 * dashboardController.js
 * Provides real-time statistics and data for the Admin Dashboard
 */

const db = require('../config/db');

/**
 * Get Admin Dashboard Statistics
 * Returns real counts from your database tables
 * @route GET /api/dashboard/stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Total Users (non-deleted)
    const [totalUsersRes] = await db.query(
      "SELECT COUNT(*) AS total FROM user"
    );
    const totalUsers = totalUsersRes[0].total;

    // Active Tasks (status = 'in_process' or 'pending', case-insensitive)
    const [activeTasksRes] = await db.query(
      "SELECT COUNT(*) AS active FROM task WHERE LOWER(status) IN ('pending', 'in_process', 'not started', 'waiting', '')"
    );
    const activeTasks = activeTasksRes[0].active;

    // Total Projects (assuming you have a 'project' table. If not, we'll use a placeholder)
    // If you don't have a 'project' table yet, change this to COUNT from task or another table
    const [projectsRes] = await db.query(
      "SELECT COUNT(*) AS total FROM task"   // Change to your actual project table if exists
    );
    const totalProjects = projectsRes[0].total;

    // Total Revenue (sum of task_cost)
    const [revenueRes] = await db.query(
      "SELECT COALESCE(SUM(task_cost), 0) AS revenue FROM task"
    );
    const totalRevenue = revenueRes[0].revenue;

    // Recent Activity (last 5 actions from task + user creation)
    const [recentActivity] = await db.query(`
      SELECT 
        'Task Updated' AS action,
        CONCAT('Task "', task_name, '" status changed to ', status) AS description,
        created_at AS time
      FROM task 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeTasks,
        totalProjects,
        totalRevenue: Math.round(totalRevenue)   // in rupees
      },
      recentActivity: recentActivity.map(item => ({
        action: item.description,
        time: getRelativeTime(item.time),
        type: 'task'
      }))
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

/**
 * Get Employee Dashboard Statistics
 * Returns data restricted to the logged-in employee
 */
exports.getEmpDashboardStats = async (req, res) => {
  const empId = req.user?.id;
  if (!empId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // 1. My Active Tasks — correct statuses matching the UI
    const [taskStats] = await db.query(
      `SELECT COUNT(*) AS active FROM task 
       WHERE assigned_to = ? AND status IN ('Pending', 'In Progress', 'Not Started')`,
      [empId]
    );

    // 2. My Total Cases
    const [caseStats] = await db.query(
      'SELECT COUNT(*) AS total FROM cases WHERE assigned_to = ?',
      [empId]
    );

    // 3. My Unique Clients (via tasks assigned to emp)
    // cases table uses client_name (string), task uses client_id (FK to customer)
    const [clientStats] = await db.query(
      `SELECT COUNT(DISTINCT c.id) AS total
       FROM customer c
       WHERE c.id IN (
         SELECT DISTINCT t.client_id FROM task t 
         WHERE t.assigned_to = ? AND t.client_id IS NOT NULL
       )`,
      [empId]
    );

    // 4. My Total Documents accessible (via folder_access on tasks, if column exists)
    let docCount = 0;
    try {
      const [docStats] = await db.query(
        `SELECT COUNT(DISTINCT d.id) AS total
         FROM documents d
         JOIN folders f ON d.folder_id = f.id
         WHERE EXISTS (
           SELECT 1 FROM task t
           WHERE t.assigned_to = ? AND t.folder_access IS NOT NULL AND FIND_IN_SET(f.id, t.folder_access)
         )`,
        [empId]
      );
      docCount = docStats[0].total;
    } catch (_) {
      // folder_access column may not exist yet — safe fallback
      docCount = 0;
    }

    // 5. My Upcoming Hearings (Next 5)
    const [hearings] = await db.query(`
      SELECT h.title, h.court, DATE_FORMAT(h.hearing_date, '%Y-%m-%d') AS date, h.hearing_time AS time
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE c.assigned_to = ? AND h.hearing_date >= CURDATE()
      ORDER BY h.hearing_date ASC
      LIMIT 5
    `, [empId]);

    // 6. My Priority Tasks (Next 5) — ordered by Critical > High > Medium > Low
    const [priorityTasks] = await db.query(`
      SELECT task_name AS name, DATE_FORMAT(due_date, '%Y-%m-%d') AS due, priority
      FROM task
      WHERE assigned_to = ? AND status != 'Completed'
      ORDER BY 
        CASE priority 
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          ELSE 4
        END, 
        due_date ASC
      LIMIT 5
    `, [empId]);

    // 7. My Recent Activity
    const [recentActivity] = await db.query(`
      SELECT 
        'Task Activity' AS action,
        CONCAT('Task: ', task_name, ' — Status: ', status) AS description,
        created_at AS time
      FROM task 
      WHERE assigned_to = ?
      ORDER BY created_at DESC 
      LIMIT 5
    `, [empId]);

    res.json({
      success: true,
      stats: {
        activeTasks: taskStats[0].active,
        totalCases: caseStats[0].total,
        totalClients: clientStats[0].total,
        totalDocuments: docCount
      },
      hearings,
      priorityTasks,
      recentActivity: recentActivity.map(item => ({
        action: item.description,
        time: getRelativeTime(item.time)
      }))
    });

  } catch (error) {
    console.error('Emp Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// Helper function to show "2 min ago", "1 hr ago", etc.
function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

/**
 * Get Employee Calendar Events
 * Returns tasks, hearings, and cases structured for a calendar
 * @route GET /api/dashboard/emp-calendar
 */
exports.getEmpCalendarEvents = async (req, res) => {
  const empId = req.user?.id;
  if (!empId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // 1. Fetch Tasks (using due_date)
    const [tasks] = await db.query(`
      SELECT 
        id, 
        task_name AS title, 
        DATE_FORMAT(due_date, '%Y-%m-%d') AS date, 
        '09:00' AS time, 
        'Task' as type,
        status
      FROM task
      WHERE assigned_to = ? AND due_date IS NOT NULL
    `, [empId]);

    // 2. Fetch Hearings (using hearing_date and hearing_time)
    const [hearings] = await db.query(`
      SELECT 
        h.id, 
        CONCAT('Hearing: ', h.title) AS title, 
        DATE_FORMAT(h.hearing_date, '%Y-%m-%d') AS date, 
        h.hearing_time AS time, 
        'Hearing' as type,
        c.title AS caseTitle
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE c.assigned_to = ? AND h.hearing_date IS NOT NULL
    `, [empId]);

    // 3. Fetch Cases/Projects (using filing_date or created_at)
    const [cases] = await db.query(`
      SELECT 
        id, 
        CONCAT('Case Filed: ', title) AS title, 
        DATE_FORMAT(filing_date, '%Y-%m-%d') AS date, 
        '10:00' AS time, 
        'Project' as type,
        status
      FROM cases
      WHERE assigned_to = ? AND filing_date IS NOT NULL
    `, [empId]);

    // Combine all events
    const allEvents = [...tasks, ...hearings, ...cases].map(event => ({
      id: `${event.type}-${event.id}`,
      title: event.title,
      date: event.date,
      time: event.time || '12:00',
      type: event.type,
      extendedProps: {
        status: event.status,
        caseTitle: event.caseTitle
      }
    }));

    res.json({
      success: true,
      events: allEvents
    });

  } catch (error) {
    console.error('Emp Calendar events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar events'
    });
  }
};
