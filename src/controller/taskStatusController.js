const db = require('../config/db');

exports.getAllTaskStatuses = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         ts.*,
         au.admin_name AS added_by_name
       FROM task_statuses ts
       LEFT JOIN admin_user au ON ts.added_by = au.id
        ORDER BY ts.created_at DESC`
    );

    const taskStatuses = rows.map(r => ({
      ...r,
      is_completed: !!r.is_completed,
      created_at: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''
    }));

    res.json({ success: true, taskStatuses });
  } catch (err) {
    console.error('Error fetching task statuses:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch task statuses' });
  }
};

exports.createTaskStatus = async (req, res) => {
  const { name, color, is_completed, status } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Status name is required' });
  }

  const addedBy = req.user?.id || null;
  const isCompleted = is_completed ? 1 : 0;

  try {
    const [result] = await db.query(
      'INSERT INTO task_statuses (name, color, is_completed, status, added_by) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), color || '#6B7280', isCompleted, status || 'Active', addedBy]
    );

    res.status(201).json({
      success: true,
      message: 'Task status created successfully',
      taskStatusId: result.insertId
    });
  } catch (err) {
    console.error('Error creating task status:', err);
    res.status(500).json({ success: false, message: 'Failed to create task status' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  const { id } = req.params;
  const { name, color, is_completed, status } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Status name is required' });
  }

  const isCompleted = is_completed ? 1 : 0;

  try {
    const [result] = await db.query(
      'UPDATE task_statuses SET name = ?, color = ?, is_completed = ?, status = ? WHERE id = ?',
      [name.trim(), color || '#6B7280', isCompleted, status || 'Active', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Task status not found' });
    }

    res.json({ success: true, message: 'Task status updated successfully' });
  } catch (err) {
    console.error('Error updating task status:', err);
    res.status(500).json({ success: false, message: 'Failed to update task status' });
  }
};

exports.deleteTaskStatus = async (req, res) => {
  const { id } = req.params;
  try {
    // Hard delete
    const [result] = await db.query(
      'DELETE FROM task_statuses WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Task status not found' });
    }

    res.json({ success: true, message: 'Task status deleted successfully' });
  } catch (err) {
    console.error('Error deleting task status:', err);
    res.status(500).json({ success: false, message: 'Failed to delete task status' });
  }
};

