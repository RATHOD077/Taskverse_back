const db = require('../config/db');

/**
 * Get all physical files
 */
exports.getAllPhysicalFiles = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM physical_file ORDER BY id DESC');
    res.json({
      success: true,
      physicalFiles: rows
    });
  } catch (error) {
    console.error('Get physical files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch physical files'
    });
  }
};

/**
 * Create a new physical file record
 */
exports.createPhysicalFile = async (req, res) => {
  const { file_name, file_number, storage_rack_no } = req.body;

  if (!file_name) {
    return res.status(400).json({
      success: false,
      message: 'File name is required'
    });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO physical_file (file_name, file_number, storage_rack_no) VALUES (?, ?, ?)',
      [file_name, file_number || null, storage_rack_no || null]
    );

    res.status(201).json({
      success: true,
      message: 'Physical file registered successfully',
      physicalFileId: result.insertId
    });
  } catch (error) {
    console.error('Create physical file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register physical file'
    });
  }
};

/**
 * Update a physical file record
 */
exports.updatePhysicalFile = async (req, res) => {
  const { id } = req.params;
  const { file_name, file_number, storage_rack_no } = req.body;

  try {
    const [result] = await db.query(
      'UPDATE physical_file SET file_name = ?, file_number = ?, storage_rack_no = ? WHERE id = ?',
      [file_name, file_number || null, storage_rack_no || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Physical file record not found'
      });
    }

    res.json({
      success: true,
      message: 'Physical file updated successfully'
    });
  } catch (error) {
    console.error('Update physical file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update physical file'
    });
  }
};

/**
 * Delete a physical file record
 */
exports.deletePhysicalFile = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM physical_file WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Physical file record not found'
      });
    }

    res.json({
      success: true,
      message: 'Physical file deleted successfully'
    });
  } catch (error) {
    console.error('Delete physical file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete physical file'
    });
  }
};
