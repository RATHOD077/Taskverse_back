const express = require('express');
const router = express.Router();
const { sendSms, getSmsLogs } = require('../controller/smsController');

router.post('/send-sms', sendSms);
router.get('/sms-logs', getSmsLogs);

module.exports = router;
