const db = require('../config/db');
const reminderService = require('../services/reminderService');
const { getPagination, getPagingMeta } = require('../utils/pagination');

/**
 * GET /api/reminders/settings
 * Fetch current automatic reminder configurations
 */
exports.getReminderSettings = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM automatic_reminders');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      'SELECT * FROM automatic_reminders ORDER BY type ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    res.json({
      success: true,
      settings: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('getReminderSettings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * PUT /api/reminders/settings/:id
 * Update a specific automatic reminder (enable/disable or change template)
 */
exports.updateReminderSetting = async (req, res) => {
  const { id } = req.params;
  const { template_id, is_enabled, channel } = req.body;

  try {
    const [result] = await db.query(
      'UPDATE automatic_reminders SET template_id = ?, is_enabled = ?, channel = ? WHERE id = ?',
      [template_id || null, is_enabled ? 1 : 0, channel || 'email', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Settings not found' });
    }

    res.json({ success: true, message: 'Reminder settings updated successfully' });
  } catch (err) {
    console.error('updateReminderSetting error:', err);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
};

/**
 * POST /api/reminders/test-trigger
 * Manually trigger all automated checks for testing purposes
 */
exports.triggerBirthdayCheck = async (req, res) => {
  try {
    await reminderService.checkAllReminders();
    res.json({ success: true, message: 'Automation scan triggered manually. Check notification logs for results.' });
  } catch (err) {
    console.error('triggerBirthdayCheck error:', err);
    res.status(500).json({ success: false, message: 'Failed to trigger automation check' });
  }
};
