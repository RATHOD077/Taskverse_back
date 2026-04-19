// src/controller/notificationController.js
const db = require('../config/db');
const { sendMail, replacePlaceholders } = require('../config/mailer');

// ───────────────────────────────────────────────────────────────
// SMTP SETTINGS
// ───────────────────────────────────────────────────────────────

/** GET /api/notifications/smtp-settings */
exports.getSmtpSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, smtp_host, smtp_port, smtp_user, from_name, from_email, is_active FROM smtp_settings ORDER BY id DESC LIMIT 1'
    );
    res.json({ success: true, settings: rows[0] || null });
  } catch (err) {
    console.error('getSmtpSettings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** POST /api/notifications/smtp-settings — Save or update SMTP config */
exports.saveSmtpSettings = async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email } = req.body;

  if (!smtp_host || !smtp_user || !smtp_password || !from_email) {
    return res.status(400).json({ success: false, message: 'smtp_host, smtp_user, smtp_password and from_email are required' });
  }

  try {
    // Deactivate all existing settings
    await db.query('UPDATE smtp_settings SET is_active = 0');

    // Insert new settings
    const [result] = await db.query(
      `INSERT INTO smtp_settings (smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [smtp_host, smtp_port || 587, smtp_user, smtp_password, from_name || 'TaskVerse', from_email]
    );

    res.json({ success: true, message: 'SMTP settings saved successfully', id: result.insertId });
  } catch (err) {
    console.error('saveSmtpSettings error:', err);
    res.status(500).json({ success: false, message: 'Server error saving SMTP settings' });
  }
};

/** POST /api/notifications/smtp-settings/test — Send test email */
exports.testSmtpSettings = async (req, res) => {
  const { test_email } = req.body;
  if (!test_email) return res.status(400).json({ success: false, message: 'test_email is required' });

  try {
    await sendMail({
      to: test_email,
      subject: 'TaskVerse SMTP Test Email ✅',
      html: `<h2>SMTP Connection Successful!</h2><p>Your SMTP settings are configured correctly in <strong>TaskVerse</strong>.</p><p style="color:#6b7280;font-size:12px">Sent at ${new Date().toLocaleString()}</p>`
    });
    res.json({ success: true, message: `Test email sent successfully to ${test_email}` });
  } catch (err) {
    console.error('testSmtpSettings error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to send test email. Check your SMTP settings.' });
  }
};

// ───────────────────────────────────────────────────────────────
// NOTIFICATION TEMPLATES
// ───────────────────────────────────────────────────────────────

/** GET /api/notifications/templates */
exports.getTemplates = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM notification_templates ORDER BY id ASC');
    res.json({ success: true, templates: rows });
  } catch (err) {
    console.error('getTemplates error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** GET /api/notifications/templates/:id */
exports.getTemplateById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM notification_templates WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, template: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** POST /api/notifications/templates */
exports.createTemplate = async (req, res) => {
  const { name, type, subject, body } = req.body;
  if (!name || !type || !subject || !body) {
    return res.status(400).json({ success: false, message: 'name, type, subject and body are required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO notification_templates (name, type, subject, body, is_active) VALUES (?, ?, ?, ?, 1)',
      [name, type, subject, body]
    );
    res.json({ success: true, message: 'Template created successfully', id: result.insertId });
  } catch (err) {
    console.error('createTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** PUT /api/notifications/templates/:id */
exports.updateTemplate = async (req, res) => {
  const { name, type, subject, body, is_active } = req.body;
  
  try {
    const [result] = await db.query(
      'UPDATE notification_templates SET name = ?, type = ?, subject = ?, body = ?, is_active = ? WHERE id = ?',
      [name, type, subject, body, is_active === undefined ? 1 : is_active, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template updated' });
  } catch (err) {
    console.error('updateTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** DELETE /api/notifications/templates/:id */
exports.deleteTemplate = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM notification_templates WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    console.error('deleteTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ───────────────────────────────────────────────────────────────
// SEND NOTIFICATIONS
// ───────────────────────────────────────────────────────────────

/** 
 * POST /api/notifications/send-task-expiry
 * Body: { user_ids: [1,2,3], task_name: 'My Task', expiry_date: '2026-05-01' }
 * Admin manually triggers task expiry email for selected team members.
 * expiry_date and task_name are set freely by the admin (no task_id required).
 */
exports.sendTaskExpiryNotification = async (req, res) => {
  const { user_ids, task_name, expiry_date } = req.body;

  if (!user_ids || !user_ids.length) {
    return res.status(400).json({ success: false, message: 'user_ids array is required' });
  }
  if (!task_name) {
    return res.status(400).json({ success: false, message: 'task_name is required' });
  }
  if (!expiry_date) {
    return res.status(400).json({ success: false, message: 'expiry_date is required' });
  }

  try {
    // Get template
    const [templates] = await db.query(
      "SELECT * FROM notification_templates WHERE type = 'task_expiry' AND is_active = 1 LIMIT 1"
    );
    if (!templates.length) return res.status(400).json({ success: false, message: 'No active task_expiry template found' });
    const template = templates[0];

    // Get users
    const placeholders = user_ids.map(() => '?').join(',');
    const [users] = await db.query(
      `SELECT id, username, email FROM user WHERE id IN (${placeholders}) AND is_deleted = 0`,
      user_ids
    );

    const templateProcessor = require('../services/templateProcessor');

    const results = { sent: [], failed: [] };

    for (const user of users) {
      if (!user.email) {
        results.failed.push({ user: user.username, reason: 'No email address' });
        continue;
      }

      // Use TemplateProcessor for automatic keywords
      const subject = await templateProcessor.process(template.subject, { 
        user_id: user.id, 
        manual_vars: { task_name, task_expiry: new Date(expiry_date).toLocaleDateString('en-IN') } 
      });
      const html = await templateProcessor.process(template.body, { 
        user_id: user.id, 
        manual_vars: { task_name, task_expiry: new Date(expiry_date).toLocaleDateString('en-IN') } 
      });

      try {
        await sendMail({ to: user.email, subject, html });
        await db.query(
          `INSERT INTO notification_logs (type, recipient_email, recipient_name, subject, status) VALUES (?, ?, ?, ?, 'sent')`,
          ['task_expiry', user.email, user.username, subject]
        );
        results.sent.push(user.username);
      } catch (mailErr) {
        await db.query(
          `INSERT INTO notification_logs (type, recipient_email, recipient_name, subject, status, error_message) VALUES (?, ?, ?, ?, 'failed', ?)`,
          ['task_expiry', user.email, user.username, subject, mailErr.message]
        );
        results.failed.push({ user: user.username, reason: mailErr.message });
      }
    }

    res.json({ success: true, message: `Sent to ${results.sent.length} user(s)`, results });
  } catch (err) {
    console.error('sendTaskExpiryNotification error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

/**
 * POST /api/notifications/send-document-expiry
 * Body: { document_id: 5 }
 * Admin manually triggers document expiry email for a specific document's customer
 */
exports.sendDocumentExpiryNotification = async (req, res) => {
  const { document_id } = req.body;
  if (!document_id) return res.status(400).json({ success: false, message: 'document_id is required' });

  try {
    // Get document info
    const [docs] = await db.query(`SELECT id, customer_id FROM customer_doc WHERE id = ?`, [document_id]);

    if (!docs.length) return res.status(404).json({ success: false, message: 'Document not found' });
    const doc = docs[0];

    // Get customer info for email address
    const [customers] = await db.query(`SELECT email, name FROM customer WHERE id = ?`, [doc.customer_id]);
    if (!customers.length || !customers[0].email) {
      return res.status(400).json({ success: false, message: 'Customer has no email address on file' });
    }
    const customer = customers[0];

    // Get template
    const [templates] = await db.query(
      "SELECT * FROM notification_templates WHERE type = 'document_expiry' AND is_active = 1 LIMIT 1"
    );
    if (!templates.length) return res.status(400).json({ success: false, message: 'No active document_expiry template found' });
    const template = templates[0];

    const templateProcessor = require('../services/templateProcessor');
    
    // Automatically fetch all keywords for this document and customer
    const subject = await templateProcessor.process(template.subject, { 
      customer_id: doc.customer_id, 
      document_id: doc.id 
    });
    const html = await templateProcessor.process(template.body, { 
      customer_id: doc.customer_id, 
      document_id: doc.id 
    });

    await sendMail({ to: customer.email, subject, html });

    await db.query(
      `INSERT INTO notification_logs (type, recipient_email, recipient_name, subject, status) VALUES (?, ?, ?, ?, 'sent')`,
      ['document_expiry', customer.email, customer.name, subject]
    );

    res.json({ success: true, message: `Notification sent to ${customer.name} (${customer.email})` });
  } catch (err) {
    console.error('sendDocumentExpiryNotification error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

// ───────────────────────────────────────────────────────────────
// HELPER ENDPOINTS
// ───────────────────────────────────────────────────────────────

/** GET /api/notifications/users — Get all active users for team selection */
exports.getUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, role FROM user WHERE is_deleted = 0 ORDER BY username ASC'
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** GET /api/notifications/user-tasks?user_id=1 — Get tasks assigned to a specific user */
exports.getTasksByUser = async (req, res) => {
  const { user_id } = req.query;
  try {
    let query = 'SELECT id, task_name, expiry_date FROM task';
    const params = [];
    if (user_id) {
      query += ' WHERE assigned_to = ?';
      params.push(user_id);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** GET /api/notifications/customers — Get all customers for dropdown */
exports.getCustomers = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email FROM customer ORDER BY name ASC'
    );
    res.json({ success: true, customers: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** GET /api/notifications/customer-documents?customer_id=5 — Documents filtered by customer */
exports.getDocumentsByCustomer = async (req, res) => {
  const { customer_id } = req.query;
  try {
    let query = `
      SELECT cd.id, cd.document_path, cd.validity, cd.doc_type,
             c.id AS customer_id, c.name AS client_name, c.email AS client_email
      FROM customer_doc cd
      JOIN customer c ON cd.customer_id = c.id
    `;
    const params = [];

    if (customer_id) {
      query += ' WHERE cd.customer_id = ?';
      params.push(customer_id);
    }

    query += ' ORDER BY cd.validity ASC';

    const [rows] = await db.query(query, params);
    res.json({ success: true, documents: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** GET /api/notifications/logs — View notification history */
exports.getNotificationLogs = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 100'
    );
    res.json({ success: true, logs: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
/**
 * POST /api/notifications/resolve-keywords
 * Logic to preview resolved text before sending
 */
exports.resolveKeywords = async (req, res) => {
  const { subject, body, customer_id, task_id, document_id, manual_vars } = req.body;
  try {
    const templateProcessor = require('../services/templateProcessor');
    const contexts = { customer_id, task_id, document_id, manual_vars };
    
    const resolvedSubject = subject ? await templateProcessor.process(subject, contexts) : '';
    const resolvedBody = body ? await templateProcessor.process(body, contexts) : '';
    
    res.json({ 
      success: true, 
      resolvedSubject, 
      resolvedBody 
    });
  } catch (err) {
    console.error('resolveKeywords error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
