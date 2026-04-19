const db = require('../config/db');

exports.getAllTaskTypes = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         tt.*,
         au.admin_name AS added_by_name
       FROM task_types tt
       LEFT JOIN admin_user au ON tt.added_by = au.id
        ORDER BY tt.created_at DESC`
    );

    const taskTypes = rows.map(r => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''
    }));

    res.json({ success: true, taskTypes });
  } catch (err) {
    console.error('Error fetching task types:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch task types' });
  }
};

exports.createTaskType = async (req, res) => {
  const { name, description, color, duration, status } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Task type name is required' });
  }

  const addedBy = req.user?.id || null;

  try {
    const [result] = await db.query(
      'INSERT INTO task_types (name, description, color, duration, status, added_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), description || '', color || '#3B82F6', duration || 60, status || 'Active', addedBy]
    );

    res.status(201).json({
      success: true,
      message: 'Task type created successfully',
      taskTypeId: result.insertId
    });
  } catch (err) {
    console.error('Error creating task type:', err);
    res.status(500).json({ success: false, message: 'Failed to create task type' });
  }
};

exports.updateTaskType = async (req, res) => {
  const { id } = req.params;
  const { name, description, color, duration, status } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Task type name is required' });
  }

  try {
    const [result] = await db.query(
      'UPDATE task_types SET name = ?, description = ?, color = ?, duration = ?, status = ? WHERE id = ?',
      [name.trim(), description || '', color || '#3B82F6', duration || 60, status || 'Active', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Task type not found' });
    }

    res.json({ success: true, message: 'Task type updated successfully' });
  } catch (err) {
    console.error('Error updating task type:', err);
    res.status(500).json({ success: false, message: 'Failed to update task type' });
  }
};

exports.deleteTaskType = async (req, res) => {
  const { id } = req.params;
  try {
    // Hard delete
    const [result] = await db.query(
      'DELETE FROM task_types WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Task type not found' });
    }

    res.json({ success: true, message: 'Task type deleted successfully' });
  } catch (err) {
    console.error('Error deleting task type:', err);
    res.status(500).json({ success: false, message: 'Failed to delete task type' });
  }
};
