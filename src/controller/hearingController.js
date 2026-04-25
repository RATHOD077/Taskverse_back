const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

// ─── GET ALL HEARINGS ─────────────────────────────────────────────────────────
exports.getAllHearings = async (req, res) => {
  try {
    const { search = '', status = '', case_id = '' } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    let conditions = [];
    const params = [];

    if (search) {
      conditions.push('(h.title LIKE ? OR h.hearing_id LIKE ? OR c.case_id LIKE ? OR h.judge LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status)  { conditions.push('h.status = ?');   params.push(status); }
    if (case_id) { conditions.push('h.case_id = ?');  params.push(case_id); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM hearings h
       LEFT JOIN cases c ON h.case_id = c.id
       ${where}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT
         h.id,
         h.hearing_id,
         h.title,
         h.court,
         h.judge,
         h.hearing_date,
         h.hearing_time,
         h.duration_minutes,
         h.status,
         h.notes,
         h.created_at,
         c.id       AS case_db_id,
         c.case_id  AS case_ref,
         c.title    AS case_title,
         cust.name  AS client_name
        FROM hearings h
        LEFT JOIN cases    c   ON h.case_id   = c.id
        LEFT JOIN customer cust ON c.client_id = cust.id
        ${where}
        ORDER BY h.hearing_date DESC, h.hearing_time DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const hearings = rows.map(r => ({
      ...r,
      hearing_date: r.hearing_date
        ? new Date(r.hearing_date).toISOString().split('T')[0]
        : '',
      created_at: r.created_at
        ? new Date(r.created_at).toISOString().split('T')[0]
        : '',
    }));

    res.json({
      success: true,
      hearings,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Error fetching hearings:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch hearings' });
  }
};

// ─── GET SINGLE HEARING ───────────────────────────────────────────────────────
exports.getHearingById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT h.*, c.case_id AS case_ref, c.title AS case_title, cust.name AS client_name
       FROM hearings h
       LEFT JOIN cases    c   ON h.case_id   = c.id
       LEFT JOIN customer cust ON c.client_id = cust.id
       WHERE h.id = ?`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Hearing not found' });
    }
    res.json({ success: true, hearing: rows[0] });
  } catch (err) {
    console.error('Error fetching hearing:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch hearing' });
  }
};

// ─── CREATE HEARING ───────────────────────────────────────────────────────────
exports.createHearing = async (req, res) => {
  const {
    title, case_id, court, judge,
    hearing_date, hearing_time, duration_minutes,
    status = 'Scheduled', notes
  } = req.body || {};

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Hearing title is required' });
  }
  if (!case_id) {
    return res.status(400).json({ success: false, message: 'Case reference is required' });
  }

  try {
    // Auto-generate hearing_id: HR + 6-digit padded number
    const [maxRows] = await db.query('SELECT MAX(CAST(SUBSTRING(hearing_id, 3) AS UNSIGNED)) AS max_val FROM hearings WHERE hearing_id LIKE "HR%"');
    const nextNum = (maxRows[0].max_val || 0) + 1;
    const hearing_id = `HR${String(nextNum).padStart(6, '0')}`;

    const [result] = await db.query(
      `INSERT INTO hearings
         (hearing_id, title, case_id, court, judge, hearing_date, hearing_time, duration_minutes, status, notes, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hearing_id,
        title.trim(),
        case_id,
        court || null,
        judge || null,
        hearing_date || null,
        hearing_time || null,
        duration_minutes || null,
        status,
        notes || null,
        req.user?.id || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Hearing scheduled successfully',
      hearingId: result.insertId,
      hearing_id
    });
  } catch (err) {
    console.error('Error creating hearing:', err);
    res.status(500).json({ success: false, message: 'Failed to schedule hearing' });
  }
};

// ─── UPDATE HEARING ───────────────────────────────────────────────────────────
exports.updateHearing = async (req, res) => {
  const { id } = req.params;
  const {
    title, case_id, court, judge,
    hearing_date, hearing_time, duration_minutes, status, notes
  } = req.body || {};

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Hearing title is required' });
  }

  try {
    const [result] = await db.query(
      `UPDATE hearings SET
         title = ?, case_id = ?, court = ?, judge = ?,
         hearing_date = ?, hearing_time = ?, duration_minutes = ?,
         status = ?, notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        title.trim(), case_id || null, court || null, judge || null,
        hearing_date || null, hearing_time || null, duration_minutes || null,
        status || 'Scheduled', notes || null, id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Hearing not found' });
    }
    res.json({ success: true, message: 'Hearing updated successfully' });
  } catch (err) {
    console.error('Error updating hearing:', err);
    res.status(500).json({ success: false, message: 'Failed to update hearing' });
  }
};

// ─── DELETE HEARING (hard) ────────────────────────────────────────────────────
exports.deleteHearing = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      'DELETE FROM hearings WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Hearing not found' });
    }
    res.json({ success: true, message: 'Hearing deleted successfully' });
  } catch (err) {
    console.error('Error deleting hearing:', err);
    res.status(500).json({ success: false, message: 'Failed to delete hearing' });
  }
};

// ─── GET HEARINGS BY CASE ─────────────────────────────────────────────────────
exports.getHearingsByCase = async (req, res) => {
  const { caseId } = req.params;
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query(
      'SELECT COUNT(*) AS total FROM hearings WHERE case_id = ?',
      [caseId]
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT h.*, c.case_id AS case_ref, c.title AS case_title
       FROM hearings h
       LEFT JOIN cases c ON h.case_id = c.id
       WHERE h.case_id = ?
       ORDER BY h.hearing_date ASC
       LIMIT ? OFFSET ?`,
      [caseId, limit, offset]
    );
    res.json({
      success: true,
      hearings: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Error fetching hearings by case:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch hearings' });
  }
};
