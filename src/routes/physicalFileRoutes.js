const express = require('express');
const router = express.Router();
const physicalFileController = require('../controller/physicalFileController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, verifyAdmin, physicalFileController.getAllPhysicalFiles);
router.post('/', verifyToken, verifyAdmin, physicalFileController.createPhysicalFile);
router.put('/:id', verifyToken, verifyAdmin, physicalFileController.updatePhysicalFile);
router.delete('/:id', verifyToken, verifyAdmin, physicalFileController.deletePhysicalFile);

module.exports = router;
