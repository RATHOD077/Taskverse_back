// backend/src/routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const customerController = require('../controller/customerController');
const { verifyAdmin, verifyToken } = require('../middleware/authMiddleware');

router.get('/',       verifyToken, customerController.getAllCustomers);
router.get('/emp',    verifyToken, customerController.getEmpCustomers);
router.get('/:id',    verifyToken, customerController.getCustomerById);
router.post('/',      verifyToken, customerController.createCustomer);
router.put('/:id',    verifyToken, customerController.updateCustomer);
router.delete('/:id', verifyToken, customerController.deleteCustomer);

module.exports = router;
