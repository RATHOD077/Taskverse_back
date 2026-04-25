/**
 * customerDocumentController.js
 * Handles Customer Document Management
 */

const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

/**
 * Get All Customer Documents
 */
exports.getAllDocuments = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM customer_doc');
    const total = countRows[0]?.total || 0;

    // 1. Fetch documents
    const [docs] = await db.query(
      'SELECT * FROM customer_doc ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    // 2. Fetch customers for mapping
    const [custs] = await db.query('SELECT id, name, email FROM customer');
    const customerMap = custs.reduce((acc, c) => {
      acc[c.id] = c;
      return acc;
    }, {});

    // 3. Map documents to customer names/emails manually
    const rows = docs.map(doc => ({
      ...doc,
      customer_name: customerMap[doc.customer_id]?.name || 'Unknown',
      customer_email: customerMap[doc.customer_id]?.email || 'N/A'
    }));

    res.json({
      success: true,
      documents: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
};

/**
 * Upload / Create New Document
 */
exports.uploadDocument = async (req, res) => {
  const { customer_id, document_id, document_path, validity, doc_type, physical_file_id } = req.body;

  if (!customer_id || !document_path) {
    return res.status(400).json({
      success: false,
      message: 'Customer ID and Document Path are required'
    });
  }

  try {
    const [result] = await db.query(`
      INSERT INTO customer_doc 
      (customer_id, document_id, document_path, validity, doc_type, physical_file_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      customer_id,
      document_id || '', // Replaced 'null' with empty string to avoid NOT NULL errors
      document_path,
      validity || null,
      doc_type || 'general',
      physical_file_id || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      documentId: result.insertId
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
};

/**
 * Update Document
 */
exports.updateDocument = async (req, res) => {
  const { id } = req.params;
  const { document_id, document_path, validity, doc_type, physical_file_id } = req.body;

  try {
    const [result] = await db.query(`
      UPDATE customer_doc 
      SET document_id = ?, document_path = ?, validity = ?, doc_type = ?, physical_file_id = ?
      WHERE id = ?
    `, [
      document_id || '', // Ensure document_id is not null
      document_path,
      validity || null,
      doc_type || 'general',
      physical_file_id || null,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document updated successfully'
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document',
      error: error.message
    });
  }
};

/**
 * Delete Document
 */
exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM customer_doc WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
};