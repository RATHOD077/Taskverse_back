const express = require('express');
const router = express.Router();
const dashboardController = require('../controller/dashboardController');
const { verifyAdmin, verifyToken } = require('../middleware/authMiddleware');

// Protected admin route
router.get('/stats', verifyAdmin, dashboardController.getDashboardStats);

// Protected employee route
router.get('/emp-stats', verifyToken, dashboardController.getEmpDashboardStats);

// Employee calendar route
router.get('/emp-calendar', verifyToken, dashboardController.getEmpCalendarEvents);

module.exports = router;