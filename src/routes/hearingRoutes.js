// src/routes/hearingRoutes.js
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const hearingController = require('../controller/hearingController');

router.get('/',                     verifyToken, hearingController.getAllHearings);
router.get('/case/:caseId',         verifyToken, hearingController.getHearingsByCase);
router.get('/:id',                  verifyToken, hearingController.getHearingById);
router.post('/',                    verifyToken, hearingController.createHearing);
router.put('/:id',                  verifyToken, hearingController.updateHearing);
router.delete('/:id',               verifyToken, hearingController.deleteHearing);

module.exports = router;
