const db = require('../config/db');

/**
 * Get all versions for a specific customer document
 */
exports.getVersionsByDocument = async (req, res) => {
  const { docId } = req.params;

  try {
    const [rows] = await db.query(`
      SELECT 
        dv.*,
        u.username as uploader_name
      FROM document_versions dv
      LEFT JOIN user u ON dv.uploaded_by = u.id
      WHERE dv.customer_doc_id = ?
      ORDER BY dv.created_at DESC
    `, [docId]);

    res.json({
      success: true,
      versions: rows
    });
  } catch (error) {
    console.error('Get document versions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document versions'
    });
  }
};

/**
 * Add a new version to a document
 */
exports.addDocumentVersion = async (req, res) => {
  const { customer_doc_id, version_label, file_path, notes } = req.body;
  const uploaded_by = req.user?.id || null;

  if (!customer_doc_id || !file_path || !version_label) {
    return res.status(400).json({
      success: false,
      message: 'Document ID, Version Label, and File Path are required'
    });
  }

  try {
    // 1. Insert new version
    const [result] = await db.query(`
      INSERT INTO document_versions 
      (customer_doc_id, version_label, file_path, notes, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
    `, [customer_doc_id, version_label, file_path, notes || '', uploaded_by]);

    // 2. Proactively update the main document's current path to the latest version?
    // User might want this. Let's do it for consistency.
    await db.query(`
      UPDATE customer_doc 
      SET document_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [file_path, customer_doc_id]);

    res.status(201).json({
      success: true,
      message: 'New version added successfully',
      versionId: result.insertId
    });
  } catch (error) {
    console.error('Add document version error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add version'
    });
  }
};

/**
 * Delete a specific version
 */
exports.deleteVersion = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM document_versions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      });
    }

    res.json({
      success: true,
      message: 'Version deleted successfully'
    });
  } catch (error) {
    console.error('Delete document version error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete version'
    });
  }
};
