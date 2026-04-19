// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');

// Admin Login Route
router.post('/admin/login', authController.adminLogin);

// Admin Reset Password Route  (mounted at /api/auth, so full path = /api/auth/admin/reset-password)
router.post('/admin/reset-password', authController.resetAdminPassword);

module.exports = router;