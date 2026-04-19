const db = require('../config/db');

/**
 * Universal Template Processor Service
 * Automatically fetches data from the database and replaces placeholders in strings.
 */
class TemplateProcessor {
  /**
   * Main entry point to process a string with keywords.
   * @param {string} text - The template string (subject or body)
   * @param {object} contexts - { customer_id, user_id, task_id, document_id, manual_vars }
   * @returns {string} - Processed text
   */
  async process(text, contexts = {}) {
    if (!text) return '';
    
    let variables = {
      system_date: new Date().toLocaleDateString('en-IN'),
      system_time: new Date().toLocaleTimeString('en-IN'),
      ...(contexts.manual_vars || {})
    };

    // 1. Fetch Customer Data
    if (contexts.customer_id) {
      const [rows] = await db.query('SELECT * FROM customer WHERE id = ?', [contexts.customer_id]);
      if (rows.length > 0) {
        const c = rows[0];
        variables = {
          ...variables,
          client_id: c.id,
          client_name: c.name,
          client_email: c.email || 'N/A',
          client_contact: c.contact || 'N/A',
          client_address: c.address || 'N/A',
          client_city: c.city || 'N/A',
          client_state: c.state || 'N/A',
          client_dob: c.dob ? new Date(c.dob).toLocaleDateString('en-IN') : 'N/A',
          name: c.name, // Universal Alias
          email: c.email || 'N/A', // Universal Alias
          contact: c.contact || 'N/A' // Universal Alias
        };
      }
    }

    // 2. Fetch User/Employee Data
    if (contexts.user_id) {
      const [rows] = await db.query('SELECT id, username, email, role FROM user WHERE id = ?', [contexts.user_id]);
      if (rows.length > 0) {
        const u = rows[0];
        variables = {
          ...variables,
          employee_name: u.username,
          employee_email: u.email || 'N/A',
          employee_role: u.role || 'N/A',
          name: u.username, // Universal Alias
          email: u.email || 'N/A' // Universal Alias
        };
      }
    }

    // 3. Fetch Task Data
    if (contexts.task_id) {
      const [rows] = await db.query('SELECT * FROM task WHERE id = ?', [contexts.task_id]);
      if (rows.length > 0) {
        const t = rows[0];
        variables = {
          ...variables,
          task_id: t.id,
          task_name: t.task_name,
          task_desc: t.description || 'N/A',
          task_expiry: t.expiry_date ? new Date(t.expiry_date).toLocaleDateString('en-IN') : 'N/A'
        };
      }
    }

    // 4. Fetch Document Data
    if (contexts.document_id) {
      const [rows] = await db.query('SELECT * FROM customer_doc WHERE id = ?', [contexts.document_id]);
      if (rows.length > 0) {
        const d = rows[0];
        variables = {
          ...variables,
          document_id: d.id,
          document_name: d.document_path ? d.document_path.split('/').pop() : `Document #${d.id}`,
          document_validity: d.validity ? new Date(d.validity).toLocaleDateString('en-IN') : 'N/A',
          document_type: d.doc_type || 'N/A'
        };
      }
    }

    // Replace keywords: {{keyword}} or {keyword}
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      // Handle {{key}}
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value || '');
      // Handle {key}
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }

    return result;
  }
}

module.exports = new TemplateProcessor();
