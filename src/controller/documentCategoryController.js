/**
 * documentCategoryController.js
 * Handles CRUD for Document Categories with automatic DCAT serial ID generation
 */

const db = require('../config/db');

/**
 * Get All Document Categories
 */
exports.getAllCategories = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, description, color, status, created_at, updated_at 
       FROM doc_category 
       ORDER BY id ASC`
    );

    res.json({
      success: true,
      categories: rows
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

/**
 * Create New Category with Auto ID (DCAT000001, DCAT000002, ...)
 */
exports.createCategory = async (req, res) => {
  const { name, description, color, status } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Category name is required'
    });
  }

  try {
    // Generate next serial ID like DCAT000001
    const [lastRow] = await db.query(
      `SELECT id FROM doc_category 
       WHERE id LIKE 'DCAT%' 
       ORDER BY id DESC 
       LIMIT 1`
    );

    let nextId = 'DCAT000001';

    if (lastRow.length > 0) {
      const lastId = lastRow[0].id;
      const lastNumber = parseInt(lastId.replace('DCAT', ''), 10);
      const nextNumber = lastNumber + 1;
      nextId = `DCAT${nextNumber.toString().padStart(6, '0')}`;
    }

    const [result] = await db.query(
      `INSERT INTO doc_category (id, name, description, color, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        nextId,
        name.trim(),
        description ? description.trim() : null,
        color || '#3b82f6',
        status || 'Active'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: {
        id: nextId,
        name: name.trim(),
        description: description ? description.trim() : null,
        color: color || '#3b82f6',
        status: status || 'Active'
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
};

/**
 * Update Category
 */
exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description, color, status } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Category name is required'
    });
  }

  try {
    const [result] = await db.query(
      `UPDATE doc_category 
       SET name = ?, description = ?, color = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        name.trim(),
        description ? description.trim() : null,
        color || '#3b82f6',
        status || 'Active',
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category'
    });
  }
};

/**
 * Delete Category (Soft delete by changing status to Inactive)
 */
exports.deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      `UPDATE doc_category SET status = 'Inactive' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category deactivated successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
};