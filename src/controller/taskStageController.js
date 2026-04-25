const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

exports.getAllStages = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM task_stages');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT 
         ts.id,
         ts.stage_name,
         ts.is_deleted,
         ts.created_at,
         au.admin_name AS added_by_name
       FROM task_stages ts
       LEFT JOIN admin_user au ON ts.added_by = au.id
       ORDER BY ts.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const stages = rows.map(r => ({
      id: r.id,
      stage_name: r.stage_name,
      added_by: r.added_by_name || '',
      created_at: r.created_at
        ? new Date(r.created_at).toISOString().slice(0, 10)
        : '',
      status: 'Active'
    }));

    res.json({
      success: true,
      stages,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Error fetching task stages:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch task stages' });
  }
};

exports.createStage = async (req, res) => {
  const { stage_name, status } = req.body || {};

  if (!stage_name || !stage_name.trim()) {
    return res.status(400).json({ success: false, message: 'Stage name is required' });
  }

  const isDeleted = String(status || 'Active').toLowerCase() === 'archived' ? 1 : 0;
  const addedBy = req.user?.id || null;

  try {
    const [result] = await db.query(
      'INSERT INTO task_stages (stage_name, added_by) VALUES (?, ?)',
      [stage_name.trim(), addedBy]
    );

    res.status(201).json({
      success: true,
      message: 'Stage created successfully',
      stageId: result.insertId
    });
  } catch (err) {
    console.error('Error creating task stage:', err);
    res.status(500).json({ success: false, message: 'Failed to create stage' });
  }
};

exports.updateStage = async (req, res) => {
  const { id } = req.params;
  const { stage_name, status } = req.body || {};

  if (!stage_name || !stage_name.trim()) {
    return res.status(400).json({ success: false, message: 'Stage name is required' });
  }

  const isDeleted = String(status || 'Active').toLowerCase() === 'archived' ? 1 : 0;

  try {
    const [result] = await db.query(
      'UPDATE task_stages SET stage_name = ? WHERE id = ?',
      [stage_name.trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Stage not found' });
    }

    res.json({ success: true, message: 'Stage updated successfully' });
  } catch (err) {
    console.error('Error updating task stage:', err);
    res.status(500).json({ success: false, message: 'Failed to update stage' });
  }
};

exports.deleteStage = async (req, res) => {
  const { id } = req.params;
  try {
    // Hard delete
    const [result] = await db.query(
      'DELETE FROM task_stages WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Stage not found' });
    }

    res.json({ success: true, message: 'Stage deleted successfully' });
  } catch (err) {
    console.error('Error deleting task stage:', err);
    res.status(500).json({ success: false, message: 'Failed to delete stage' });
  }
};

