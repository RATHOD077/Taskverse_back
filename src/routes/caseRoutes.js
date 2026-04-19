// src/routes/caseRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const caseController  = require('../controller/caseController');

// All routes require a logged-in user (employee or admin)
router.get('/',               verifyToken, caseController.getAllCases);
router.get('/:id',            verifyToken, caseController.getCaseById);
router.post('/',              verifyToken, caseController.createCase);
router.put('/:id',            verifyToken, caseController.updateCase);
router.delete('/:id',         verifyToken, caseController.deleteCase);
router.patch('/:id/toggle',   verifyToken, caseController.toggleCaseStatus);

module.exports = router;
