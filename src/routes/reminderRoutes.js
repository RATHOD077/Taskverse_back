const express = require('express');
const router = express.Router();
const reminderController = require('../controller/reminderController');
// Assume some auth middleware exists, like authMiddleware.js or similar
// For now, I'll check common middleware paths
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/settings', verifyAdmin, reminderController.getReminderSettings);
router.put('/settings/:id', verifyAdmin, reminderController.updateReminderSetting);
router.post('/test-trigger', verifyAdmin, reminderController.triggerBirthdayCheck);

module.exports = router;
