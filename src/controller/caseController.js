const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

// ─── GET ALL CASES ────────────────────────────────────────────────────────────
exports.getAllCases = async (req, res) => {
  try {
    const { search = '', status = '', priority = '', type = '', active_status = '' } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    let conditions = [];
    const params = [];

    if (search) {
      conditions.push('(c.title LIKE ? OR c.case_id LIKE ? OR cust.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status)        { conditions.push('c.status = ?');        params.push(status); }
    if (priority)      { conditions.push('c.priority = ?');      params.push(priority); }
    if (type)          { conditions.push('c.case_type = ?');     params.push(type); }
    if (active_status) { conditions.push('c.active_status = ?'); params.push(active_status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM cases c
       LEFT JOIN customer cust ON c.client_id = cust.id
       ${where}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT 
         c.id,
         c.case_id,
         c.title,
         c.case_type,
         c.status,
         c.priority,
         c.active_status,
         c.filing_date,
         c.description,
         c.created_at,
         c.updated_at,
         c.client_id,
         cust.name AS client_name,
         u.username AS assigned_to_name
       FROM cases c
       LEFT JOIN user     u    ON c.assigned_to = u.id
       LEFT JOIN customer cust ON c.client_id = cust.id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const cases = rows.map(r => ({
      ...r,
      filing_date: r.filing_date ? new Date(r.filing_date).toISOString().split('T')[0] : '',
      created_at:  r.created_at  ? new Date(r.created_at).toISOString().split('T')[0]  : '',
    }));

    res.json({
      success: true,
      cases,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Error fetching cases:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch cases' });
  }
};

// ─── GET SINGLE CASE ─────────────────────────────────────────────────────────
exports.getCaseById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT c.*, cust.name AS client_name, u.username AS assigned_to_name
       FROM cases c
       LEFT JOIN user     u    ON c.assigned_to = u.id
       LEFT JOIN customer cust ON c.client_id   = cust.id
       WHERE c.id = ?`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    res.json({ success: true, case: rows[0] });
  } catch (err) {
    console.error('Error fetching case:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch case' });
  }
};

// ─── CREATE CASE ─────────────────────────────────────────────────────────────
exports.createCase = async (req, res) => {
  const {
    title, client_id, case_type, status = 'Open',
    priority = 'Medium', filing_date, description, active_status = 'Active', assigned_to
  } = req.body || {};

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Case title is required' });
  }

  try {
    // Auto-generate case_id: CASE + 6-digit padded number
    const [maxRows] = await db.query('SELECT MAX(CAST(SUBSTRING(case_id, 5) AS UNSIGNED)) AS max_val FROM cases WHERE case_id LIKE "CASE%"');
    const nextNum = (maxRows[0].max_val || 0) + 1;
    const case_id = `CASE${String(nextNum).padStart(6, '0')}`;

    const [result] = await db.query(
      `INSERT INTO cases 
         (case_id, title, client_id, case_type, status, priority, filing_date, description, active_status, assigned_to, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        case_id,
        title.trim(),
        client_id || null,
        case_type || null,
        status,
        priority,
        filing_date || null,
        description || null,
        active_status,
        assigned_to || null,
        req.user?.id || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Case created successfully',
      caseId: result.insertId,
      case_id
    });
  } catch (err) {
    console.error('Error creating case:', err);
    res.status(500).json({ success: false, message: 'Failed to create case' });
  }
};

// ─── UPDATE CASE ─────────────────────────────────────────────────────────────
exports.updateCase = async (req, res) => {
  const { id } = req.params;
  const {
    title, client_id, case_type, status,
    priority, filing_date, description, active_status, assigned_to
  } = req.body || {};

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Case title is required' });
  }

  try {
    const [result] = await db.query(
      `UPDATE cases SET
         title = ?, client_id = ?, case_type = ?, status = ?,
         priority = ?, filing_date = ?, description = ?,
         active_status = ?, assigned_to = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        title.trim(), client_id || null, case_type || null, status || 'Open',
        priority || 'Medium', filing_date || null, description || null,
        active_status || 'Active', assigned_to || null, id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    res.json({ success: true, message: 'Case updated successfully' });
  } catch (err) {
    console.error('Error updating case:', err);
    res.status(500).json({ success: false, message: 'Failed to update case' });
  }
};

// ─── DELETE CASE (hard) ───────────────────────────────────────────────────────
exports.deleteCase = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      'DELETE FROM cases WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (err) {
    console.error('Error deleting case:', err);
    res.status(500).json({ success: false, message: 'Failed to delete case' });
  }
};

// ─── TOGGLE ACTIVE STATUS ────────────────────────────────────────────────────
exports.toggleCaseStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT active_status FROM cases WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const newStatus = rows[0].active_status === 'Active' ? 'Inactive' : 'Active';
    await db.query('UPDATE cases SET active_status = ?, updated_at = NOW() WHERE id = ?', [newStatus, id]);
    res.json({ success: true, message: `Case marked as ${newStatus}`, active_status: newStatus });
  } catch (err) {
    console.error('Error toggling case status:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle case status' });
  }
};
