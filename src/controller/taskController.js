/**
 * taskController.js
 * Handles all task-related operations for admin
 *
 * Schema:
 *   task.created_by  → FK → admin_user(id)   [who created the task - from JWT]
 *   task.assigned_to → FK → user(id) NULLABLE [who is assigned the task - from dropdown]
 */

const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

// ─── Get All Tasks (Admin) ────────────────────────────────────────────────────
/**
 * Get All Tasks (Admin only)
 */
exports.getAllTasks = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM task');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(`
      SELECT 
        t.id,
        t.task_name AS title,
        t.total_stages,
        t.required_time,
        t.priority,
        t.status,
        t.task_cost,
        t.created_at,
        t.task_type,
        t.due_date,
        t.client_id,
        t.case_id,
        t.folder_access,
        u.id AS assigned_to,
        u.username AS assigned_to_name,
        c.name AS client_name,
        ca.case_id AS case_code,
        ca.title AS case_title
      FROM task t
      LEFT JOIN user u ON t.assigned_to = u.id
      LEFT JOIN customer c ON t.client_id = c.id
      LEFT JOIN cases ca ON t.case_id = ca.id
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({ 
      success: true, 
      tasks: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching tasks',
      error: error.message 
    });
  }
};

// ─── Create Task ──────────────────────────────────────────────────────────────
exports.createTask = async (req, res) => {
  const { title, total_stages, required_time, priority, assigned_to, status, task_cost, client_id, case_id, task_type, due_date, folder_access } = req.body;

  // created_by comes from the authenticated admin's JWT token
  const adminId = req.user?.id;

  if (!title || title.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Task name (title) is required'
    });
  }

  // Resolve assigned_to → null means Unassigned
  let assignedTo = null;
  if (assigned_to !== undefined && assigned_to !== null && assigned_to !== '' && assigned_to !== 'null') {
    assignedTo = parseInt(assigned_to, 10);
    if (isNaN(assignedTo) || assignedTo <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user selected for assignment'
      });
    }

    // Pre-validate: confirm the user exists in the `user` table
    const [userCheck] = await db.query(
      'SELECT id FROM user WHERE id = ?',
      [assignedTo]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected user does not exist. Please choose a valid user or leave unassigned.'
      });
    }
  }

  try {
    const [result] = await db.query(
      `INSERT INTO task (task_name, total_stages, required_time, priority, status, created_by, assigned_to, task_cost, client_id, case_id, task_type, due_date, folder_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        Number(total_stages) || 1,
        required_time || null,
        priority || 'Medium',
        status || 'Not Started',
        adminId,          // ✅ admin who created the task (satisfies FK → admin_user)
        assignedTo,       // ✅ employee assigned to task  (FK → user, nullable)
        parseFloat(task_cost) || 0.00,
        client_id || null,
        case_id || null,
        task_type || 'Administrative',
        due_date || null,
        folder_access || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      taskId: result.insertId
    });
  } catch (err) {
    console.error('Create task error:', err);

    if (err.code === 'ER_NO_REFERENCED_ROW_2' || (err.message && err.message.includes('foreign key'))) {
      return res.status(400).json({
        success: false,
        message: 'Foreign key error: make sure the admin account is valid.'
      });
    }

    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        success: false,
        message: 'Database column error — assigned_to column may not exist yet. Run the migration SQL.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating task'
    });
  }
};

// ─── Update Task ──────────────────────────────────────────────────────────────
exports.updateTask = async (req, res) => {
  const { id } = req.params;
  const { title, total_stages, required_time, priority, assigned_to, status, task_cost, client_id, case_id, task_type, due_date, folder_access } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Task name (title) is required'
    });
  }

  let assignedTo = null;
  if (assigned_to !== undefined && assigned_to !== null && assigned_to !== '' && assigned_to !== 'null') {
    assignedTo = parseInt(assigned_to, 10);
    if (isNaN(assignedTo) || assignedTo <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user selected'
      });
    }

    // Pre-validate: confirm the user exists in the `user` table
    const [userCheck] = await db.query(
      'SELECT id FROM user WHERE id = ?',
      [assignedTo]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected user does not exist. Please choose a valid user or leave unassigned.'
      });
    }
  }

  try {
    const [result] = await db.query(
      `UPDATE task
       SET task_name = ?, total_stages = ?, required_time = ?, priority = ?,
           status = ?, assigned_to = ?, task_cost = ?,
           client_id = ?, case_id = ?, task_type = ?, due_date = ?, folder_access = ?
       WHERE id = ?`,
      [
        title.trim(),
        Number(total_stages) || 1,
        required_time || null,
        priority || 'Medium',
        status || 'Not Started',
        assignedTo,        // ✅ only updating assigned_to, NOT created_by
        parseFloat(task_cost) || 0.00,
        client_id || null,
        case_id || null,
        task_type || 'Administrative',
        due_date || null,
        folder_access || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({ success: true, message: 'Task updated successfully' });
  } catch (err) {
    console.error('Update task error:', err);

    if (err.code === 'ER_NO_REFERENCED_ROW_2' || (err.message && err.message.includes('foreign key'))) {
      return res.status(400).json({
        success: false,
        message: 'Selected user does not exist. Please choose a valid user.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating task'
    });
  }
};

// ─── Get Employee Tasks ───────────────────────────────────────────────────────
/**
 * Get Tasks assigned to the logged-in employee
 * @route GET /api/tasks/emp
 */
exports.getEmpTasks = async (req, res) => {
  const empId = req.user?.id;
  if (!empId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query(
      'SELECT COUNT(*) AS total FROM task WHERE assigned_to = ?',
      [empId]
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(`
      SELECT 
        t.id,
        t.task_name AS title,
        t.total_stages,
        t.required_time,
        t.priority,
        t.status,
        t.task_cost,
        t.created_at,
        t.task_type,
        t.due_date,
        t.client_id,
        t.case_id,
        t.folder_access,
        c.name AS client_name,
        ca.case_id AS case_code,
        ca.title AS case_title
      FROM task t
      LEFT JOIN customer c ON t.client_id = c.id
      LEFT JOIN cases ca ON t.case_id = ca.id
      WHERE t.assigned_to = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [empId, limit, offset]);

    res.json({ 
      success: true, 
      tasks: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (error) {
    console.error('Get emp tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching your tasks',
      error: error.message 
    });
  }
};

/**
 * Update Task Status (Employee)
 * Allows employee to update the status of THEIR task
 * @route PUT /api/tasks/:id/status
 */
exports.updateTaskStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const empId = req.user?.id;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  try {
    const [result] = await db.query(
      'UPDATE task SET status = ? WHERE id = ? AND assigned_to = ?',
      [status, id, empId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found or not assigned to you' 
      });
    }

    res.json({ success: true, message: 'Task status updated successfully' });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
};

// ─── Delete Task ──────────────────────────────────────────────────────────────
exports.deleteTask = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM task WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};