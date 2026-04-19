// jobs/emailScheduler.js
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('../config/db');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family: 4,
  tls: { rejectUnauthorized: true }
});

// Store scheduled jobs in memory (for simplicity)
const scheduledJobs = new Map();

// Schedule Email
const scheduleEmail = async (emailData, scheduleTime) => {
  const { to, subject, body, fromName = "TaskVerse" } = emailData;

  // Convert scheduleTime to cron format
  const date = new Date(scheduleTime);
  const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

  console.log(`📅 Email scheduled for ${date.toLocaleString()} | Cron: ${cronExpression}`);

  const job = cron.schedule(cronExpression, async () => {
    try {
      const mailOptions = {
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: body,
        text: body.replace(/<[^>]+>/g, ''),
      };

      const info = await transporter.sendMail(mailOptions);

      // Log as Success
      await db.execute(
        `INSERT INTO email_logs (sender, recipient, subject, body, status, gateway, message_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [process.env.SMTP_USER || 'system', to, subject, body, 'Success', 'Gmail', info.messageId]
      );

      console.log(`✅ Scheduled email sent to ${to}`);

    } catch (error) {
      console.error("Scheduled email failed:", error);

      await db.execute(
        `INSERT INTO email_logs (sender, recipient, subject, body, status, gateway, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [process.env.SMTP_USER || 'system', to, subject, body, 'Failed', 'Gmail', error.message]
      );
    }

    // Remove job after execution
    scheduledJobs.delete(emailData.id || Date.now());
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"   // Change if you are in different timezone
  });

  scheduledJobs.set(Date.now(), job);
  return true;
};

module.exports = { scheduleEmail };