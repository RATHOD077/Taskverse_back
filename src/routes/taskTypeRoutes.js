const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const taskTypeController = require('../controller/taskTypeController');

router.get('/',      verifyAdmin, taskTypeController.getAllTaskTypes);
router.post('/',     verifyAdmin, taskTypeController.createTaskType);
router.put('/:id',   verifyAdmin, taskTypeController.updateTaskType);
router.delete('/:id', verifyAdmin, taskTypeController.deleteTaskType);

module.exports = router;
