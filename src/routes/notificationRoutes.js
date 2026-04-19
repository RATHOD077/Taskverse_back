// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const nc = require('../controller/notificationController');
const { verifyAdmin } = require('../middleware/authMiddleware');

// SMTP Settings
router.get('/smtp-settings',          verifyAdmin, nc.getSmtpSettings);
router.post('/smtp-settings',         verifyAdmin, nc.saveSmtpSettings);
router.post('/smtp-settings/test',    verifyAdmin, nc.testSmtpSettings);

// Notification Templates
router.get('/templates',              verifyAdmin, nc.getTemplates);
router.get('/templates/:id',          verifyAdmin, nc.getTemplateById);
router.post('/templates',             verifyAdmin, nc.createTemplate);
router.put('/templates/:id',          verifyAdmin, nc.updateTemplate);
router.delete('/templates/:id',       verifyAdmin, nc.deleteTemplate);

// Send Notifications
router.post('/send-task-expiry',      verifyAdmin, nc.sendTaskExpiryNotification);
router.post('/send-document-expiry',  verifyAdmin, nc.sendDocumentExpiryNotification);

// Helper Data Endpoints
router.get('/users',                  verifyAdmin, nc.getUsers);
router.get('/user-tasks',             verifyAdmin, nc.getTasksByUser);
router.get('/customers',              verifyAdmin, nc.getCustomers);
router.get('/customer-documents',     verifyAdmin, nc.getDocumentsByCustomer);
router.post('/resolve-keywords',      verifyAdmin, nc.resolveKeywords);
router.get('/logs',                   verifyAdmin, nc.getNotificationLogs);

module.exports = router;
