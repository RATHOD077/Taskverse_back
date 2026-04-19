// src/config/mailer.js
// Dynamic SMTP transporter — reads config from smtp_settings table
const nodemailer = require('nodemailer');
const db = require('./db');

/**
 * Build and return a nodemailer transporter from the active SMTP settings in the DB.
 */
const getTransporter = async () => {
  const [rows] = await db.query(
    'SELECT * FROM smtp_settings WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  );

  if (!rows || rows.length === 0) {
    throw new Error('No active SMTP settings found. Please configure SMTP settings in Admin → Notification Templates → SMTP Settings.');
  }

  const config = rows[0];

  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: config.smtp_user,
      pass: config.smtp_password
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certs in dev
    }
  });

  return { transporter, config };
};

/**
 * Replaces template variables in subject/body strings.
 * e.g. '{employee_name}' → 'John Doe'
 */
const replacePlaceholders = (text, variables = {}) => {
  if (!text) return '';
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
};

/**
 * Sends an email using the stored SMTP settings.
 * @param {object} options - { to, subject, html, text }
 */
const sendMail = async ({ to, subject, html, text }) => {
  const { transporter, config } = await getTransporter();

  const info = await transporter.sendMail({
    from: `"${config.from_name || 'TaskVerse'}" <${config.from_email}>`,
    to,
    subject,
    html: html || undefined,
    text: text || undefined
  });

  return info;
};

module.exports = { sendMail, replacePlaceholders, getTransporter };
