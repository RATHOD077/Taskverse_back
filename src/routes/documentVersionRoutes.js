const express = require('express');
const router = express.Router();
const documentVersionController = require('../controller/documentVersionController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/:docId', verifyToken, documentVersionController.getVersionsByDocument);
router.post('/', verifyToken, documentVersionController.addDocumentVersion);
router.delete('/:id', verifyToken, verifyAdmin, documentVersionController.deleteVersion);

module.exports = router;
