const db = require('../config/db');

// Auto-migrate: create email_templates table
(async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ email_templates table ready");
  } catch (e) {
    console.log("ℹ️ email_templates table check failed:", e.message);
  }
})();

const getTemplates = async (req, res) => {
  try {
    const [templates] = await db.execute('SELECT * FROM email_templates ORDER BY created_at DESC');
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch templates', error: error.message });
  }
};

const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const [templates] = await db.execute('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (templates.length === 0) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, template: templates[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch template', error: error.message });
  }
};

const createTemplate = async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body are required' });
    }

    const [result] = await db.execute(
      'INSERT INTO email_templates (name, subject, body) VALUES (?, ?, ?)',
      [name, subject, body]
    );

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template: { id: result.insertId, name, subject, body }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create template', error: error.message });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, body } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Name, subject, and body are required' });
    }

    await db.execute(
      'UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ?',
      [name, subject, body, id]
    );

    res.json({ success: true, message: 'Template updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update template', error: error.message });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM email_templates WHERE id = ?', [id]);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete template', error: error.message });
  }
};

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
