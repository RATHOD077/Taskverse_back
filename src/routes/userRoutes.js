// backend/src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// ── Employee Login (public) ──────────────────────────────────────────────────
router.post('/login', userController.userLogin);

// ── Admin manages users ──────────────────────────────────────────────────────
router.get('/',        verifyAdmin, userController.getAllUsers);
router.post('/',       verifyAdmin, userController.createUser);
router.put('/:id',     verifyAdmin, userController.updateUser);
router.delete('/:id',  verifyAdmin, userController.deleteUser);

// ── Employee views own tasks ─────────────────────────────────────────────────
router.get('/my-tasks', verifyToken, userController.getMyTasks);

module.exports = router;
