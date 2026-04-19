const express = require('express');
const router = express.Router();
const documentCategoryController = require('../controller/documentCategoryController');
const { verifyAdmin } = require('../middleware/authMiddleware');

// Get all categories
router.get('/', verifyAdmin, documentCategoryController.getAllCategories);

// Create new category
router.post('/', verifyAdmin, documentCategoryController.createCategory);

// Update category
router.put('/:id', verifyAdmin, documentCategoryController.updateCategory);

// Delete (deactivate) category
router.delete('/:id', verifyAdmin, documentCategoryController.deleteCategory);

module.exports = router;