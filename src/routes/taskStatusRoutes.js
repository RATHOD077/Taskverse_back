const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const taskStatusController = require('../controller/taskStatusController');

router.get('/',      verifyAdmin, taskStatusController.getAllTaskStatuses);
router.post('/',     verifyAdmin, taskStatusController.createTaskStatus);
router.put('/:id',   verifyAdmin, taskStatusController.updateTaskStatus);
router.delete('/:id', verifyAdmin, taskStatusController.deleteTaskStatus);

module.exports = router;
