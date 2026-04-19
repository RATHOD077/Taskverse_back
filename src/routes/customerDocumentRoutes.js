const express = require('express');
const router = express.Router();
const customerDocumentController = require('../controller/customerDocumentController');
const { verifyAdmin, verifyToken } = require('../middleware/authMiddleware');
const db = require('../config/db');

// Get all documents (admin only)
router.get('/', verifyAdmin, customerDocumentController.getAllDocuments);

// TEST ROUTE (Temporary) - to debug 500 error
router.get('/test-all', customerDocumentController.getAllDocuments);

// ── Get documents for a specific customer (employee + admin) ──────────────
router.get('/by-customer/:customerId', verifyToken, async (req, res) => {
  const { customerId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, customer_id, document_path, validity, doc_type, physical_file_id
       FROM customer_doc
       WHERE customer_id = ?
       ORDER BY id DESC`,
      [customerId]
    );
    res.json({ success: true, documents: rows });
  } catch (err) {
    console.error('Get customer docs error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Upload new document
router.post('/', verifyAdmin, customerDocumentController.uploadDocument);

// Update document
router.put('/:id', verifyAdmin, customerDocumentController.updateDocument);

// Delete document
router.delete('/:id', verifyAdmin, customerDocumentController.deleteDocument);

module.exports = router;