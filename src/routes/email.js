// routes/email.js  → Only Routes (Clean)
const express = require('express');
const router = express.Router();
const { sendEmail, getEmailLogs } = require('../controller/emailController');

// Send Email
router.post('/send-email', sendEmail);

// Get Email Logs
router.get('/email-logs', getEmailLogs);

module.exports = router;