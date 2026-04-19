const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const controller = require('../controller/taskStageController');

router.get('/',      verifyAdmin, controller.getAllStages);
router.post('/',     verifyAdmin, controller.createStage);
router.put('/:id',   verifyAdmin, controller.updateStage);
router.delete('/:id', verifyAdmin, controller.deleteStage);

module.exports = router;

