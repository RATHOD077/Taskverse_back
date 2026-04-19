// backend/src/routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controller/roleController');
const { verifyAdmin } = require('../middleware/authMiddleware');

router.get('/',       verifyAdmin, roleController.getAllRoles);
router.post('/',      verifyAdmin, roleController.createRole);
router.put('/:id',    verifyAdmin, roleController.updateRole);
router.delete('/:id', verifyAdmin, roleController.deleteRole);

// Role permissions
router.get('/permissions/catalog', verifyAdmin, roleController.getPermissionsCatalog);
router.get('/:id/permissions',     verifyAdmin, roleController.getRolePermissions);
router.put('/:id/permissions',     verifyAdmin, roleController.setRolePermissions);

module.exports = router;
