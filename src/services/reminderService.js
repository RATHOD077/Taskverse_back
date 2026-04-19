const db = require('../config/db');
const { sendMail } = require('../config/mailer');

/**
 * Service to handle automated reminders and birthday checks
 */
class ReminderService {
  /**
   * Initializes the database schema for reminders
   */
  async init() {
    try {
      console.log('--- Initializing Reminder Service ---');
      
      // Ensure 'user' table has 'dob'
      try {
        await db.query(`ALTER TABLE user ADD COLUMN dob DATE AFTER contact`);
      } catch (e) { /* existing */ }

      // table check
      await db.query(`
        CREATE TABLE IF NOT EXISTS automatic_reminders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          type VARCHAR(50) NOT NULL UNIQUE,
          template_id INT DEFAULT NULL,
          channel ENUM('email', 'sms', 'both') DEFAULT 'email',
          is_enabled TINYINT(1) DEFAULT 0,
          run_time TIME DEFAULT '09:00:00',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL
        )
      `);

      // Migration: Add channel column if not exists
      try {
        await db.query(`ALTER TABLE automatic_reminders ADD COLUMN channel ENUM('email', 'sms', 'both') DEFAULT 'email' AFTER template_id`);
      } catch (e) { /* exists */ }

      // Notification logs table (Updated to include channel)
      await db.query(`
        CREATE TABLE IF NOT EXISTS notification_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          channel VARCHAR(20) DEFAULT 'email',
          recipient_email VARCHAR(255) NOT NULL,
          recipient_name VARCHAR(255),
          subject VARCHAR(255),
          status VARCHAR(20) DEFAULT 'sent',
          error_message TEXT,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration: Add channel column to logs if not exists
      try {
        await db.query(`ALTER TABLE notification_logs ADD COLUMN channel VARCHAR(20) DEFAULT 'email' AFTER type`);
      } catch (e) { /* exists */ }

      // All 5 types now:
      const defaultTypes = [
        'birthday_client', 
        'birthday_employee', 
        'document_expiry_15d', 
        'document_expiry_10d', 
        'document_expiry_5d', 
        'task_reminder_7d', 
        'task_reminder_1d'
      ];
      
      for (const t of defaultTypes) {
        await db.query(`INSERT IGNORE INTO automatic_reminders (type, is_enabled, channel) VALUES (?, 0, 'email')`, [t]);
      }
      
      console.log('--- Reminder Service Initialized ---');
    } catch (err) {
      console.error('Failed to initialize Reminder Service:', err);
    }
  }

  async checkAllReminders() {
    console.log('[ReminderService] Starting daily automation check...');
    try {
      const [settings] = await db.query('SELECT * FROM automatic_reminders WHERE is_enabled = 1');
      if (!settings.length) {
        console.log('[ReminderService] No automatic reminders enabled.');
        return;
      }

      for (const setting of settings) {
        if (!setting.template_id) continue;
        const [templates] = await db.query('SELECT * FROM notification_templates WHERE id = ?', [setting.template_id]);
        if (!templates.length) continue;
        const template = templates[0];

        switch (setting.type) {
          case 'birthday_client': await this.processClientBirthdays(template, setting.channel); break;
          case 'birthday_employee': await this.processEmployeeBirthdays(template, setting.channel); break;
          case 'document_expiry_15d': await this.processDocumentExpiries(template, 15, setting.channel); break;
          case 'document_expiry_10d': await this.processDocumentExpiries(template, 10, setting.channel); break;
          case 'document_expiry_5d': await this.processDocumentExpiries(template, 5, setting.channel); break;
          case 'task_reminder_7d': await this.processTaskReminders(template, 7, setting.channel); break;
          case 'task_reminder_1d': await this.processTaskReminders(template, 1, setting.channel); break;
        }
      }
      console.log('[ReminderService] All automation checks complete.');
    } catch (err) {
      console.error('[ReminderService] checkAllReminders error:', err);
    }
  }

  async processClientBirthdays(template, channel) {
    const [clients] = await db.query(`
      SELECT id, name, email, contact FROM customer 
      WHERE MONTH(dob) = MONTH(CURRENT_DATE()) AND DAY(dob) = DAY(CURRENT_DATE())
    `);
    if (clients.length === 0) return;
    for (const client of clients) {
      await this.dispatchTemplate(template, client.email, client.contact, client.name, { customer_id: client.id }, 'birthday_client', channel);
    }
  }

  async processEmployeeBirthdays(template, channel) {
    const [employees] = await db.query(`
      SELECT id, username, email, contact FROM user 
      WHERE MONTH(dob) = MONTH(CURRENT_DATE()) AND DAY(dob) = DAY(CURRENT_DATE())
      AND is_deleted = 0
    `);
    if (employees.length === 0) return;
    for (const emp of employees) {
      await this.dispatchTemplate(template, emp.email, emp.contact, emp.username, { user_id: emp.id }, 'birthday_employee', channel);
    }
  }

  async processDocumentExpiries(template, days, channel) {
    const [docs] = await db.query(`
      SELECT cd.id, cd.customer_id, cd.document_path, cd.validity, c.name AS client_name, c.email AS client_email, c.contact AS client_contact
      FROM customer_doc cd
      JOIN customer c ON cd.customer_id = c.id
      WHERE DATE(cd.validity) = DATE(DATE_ADD(NOW(), INTERVAL ? DAY))
    `, [days]);

    if (docs.length === 0) return;
    console.log(`[ReminderService] Sending ${days}d doc expiry alerts (${channel}) to ${docs.length} clients...`);

    for (const doc of docs) {
      await this.dispatchTemplate(template, doc.client_email, doc.client_contact, doc.client_name, { 
        customer_id: doc.customer_id, 
        document_id: doc.id 
      }, `document_expiry_${days}d`, channel);
    }
  }

  async processTaskReminders(template, days, channel) {
    const [tasks] = await db.query(`
      SELECT t.id, t.task_name, t.expiry_date, u.id AS user_id, u.username AS employee_name, u.email AS employee_email, u.contact AS employee_contact
      FROM task t
      JOIN user u ON t.assigned_to = u.id
      WHERE DATE(t.expiry_date) = DATE(DATE_ADD(NOW(), INTERVAL ? DAY))
      AND u.is_deleted = 0
    `, [days]);

    if (tasks.length === 0) return;
    console.log(`[ReminderService] Sending ${days}d task reminders (${channel}) to ${tasks.length} employees...`);

    for (const task of tasks) {
      await this.dispatchTemplate(template, task.employee_email, task.employee_contact, task.employee_name, { 
        task_id: task.id, 
        user_id: task.user_id 
      }, `task_reminder_${days}d`, channel);
    }
  }

  /**
   * Dispatches notifications via Email, SMS, or both
   */
  async dispatchTemplate(template, email, phone, name, contexts, logType, channel = 'email') {
    const templateProcessor = require('./templateProcessor');
    
    // Resolve keywords
    const subject = await templateProcessor.process(template.subject, contexts);
    const bodyHtml = await templateProcessor.process(template.body, contexts);
    // For SMS, strip HTML tags
    const bodyText = bodyHtml.replace(/<[^>]+>/g, ' ');

    // ── EMAIL CHANNEL ───────────────────────────────────────────────
    if (channel === 'email' || channel === 'both') {
      if (email && email.trim()) {
        try {
          await sendMail({ to: email, subject, html: bodyHtml });
          await this.logNotification(logType, 'email', email, name, subject, 'sent');
        } catch (e) {
          await this.logNotification(logType, 'email', email, name, subject, 'failed', e.message);
        }
      }
    }

    // ── SMS CHANNEL ─────────────────────────────────────────────────
    if (channel === 'sms' || channel === 'both') {
      if (phone && phone.trim()) {
        try {
          await this.deliverSmsInternal(phone, bodyText);
          await this.logNotification(logType, 'sms', phone, name, 'SMS Notification', 'sent');
        } catch (e) {
          await this.logNotification(logType, 'sms', phone, name, 'SMS Notification', 'failed', e.message);
        }
      }
    }
  }

  /**
   * Internal helper to talk to Twilio (delegates to core deliverSms logic)
   */
  async deliverSmsInternal(to, body) {
    try {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      return await client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
    } catch (err) {
      console.error('[ReminderService] SMS delivery failed:', err.message);
      throw err;
    }
  }

  async logNotification(type, channel, recipient, name, subject, status, error = null) {
    try {
      await db.query(
        `INSERT INTO notification_logs (type, channel, recipient_email, recipient_name, subject, status, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [type, channel, recipient || 'Unknown', name, subject, status, error]
      );
    } catch (e) {
      console.error('[ReminderService] Failed to log notification:', e);
    }
  }
}

module.exports = new ReminderService();
