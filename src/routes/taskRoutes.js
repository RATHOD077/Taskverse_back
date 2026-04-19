// backend/src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const taskController = require('../controller/taskController');
const { verifyAdmin, verifyToken } = require('../middleware/authMiddleware');

router.get('/',       verifyAdmin, taskController.getAllTasks);
router.get('/emp',    verifyToken, taskController.getEmpTasks);
router.post('/',      verifyAdmin, taskController.createTask);
router.put('/:id',    verifyAdmin, taskController.updateTask);
router.put('/:id/status', verifyToken, taskController.updateTaskStatus);
router.delete('/:id', verifyAdmin, taskController.deleteTask);

module.exports = router;
