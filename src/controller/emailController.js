// controllers/emailController.js
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const db = require('../config/db');

dotenv.config();

// Create transporter
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

// Verify SMTP on startup
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP Connection Error:", error);
  } else {
    console.log("✅ SMTP Server is ready");
  }
});

// Auto-migrate: add scheduled_at column safely
(async () => {
  try {
    const [cols] = await db.execute("SHOW COLUMNS FROM email_logs LIKE 'scheduled_at'");
    if (cols.length === 0) {
      await db.execute("ALTER TABLE email_logs ADD COLUMN scheduled_at DATETIME NULL DEFAULT NULL");
      console.log("✅ email_logs.scheduled_at column added and ready");
    } else {
      console.log("✅ email_logs.scheduled_at column already exists");
    }
  } catch (e) {
    console.log("ℹ️ scheduled_at column check failed (safe to ignore):", e.message);
  }
})();

// Helper: Relative Time
const getRelativeTime = (date) => {
  if (!date) return "Unknown";
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) > 1 ? 's' : ''} ago`;
};

// Helper: Resolves keywords for a given text and context
const resolveText = async (text, contexts) => {
  const templateProcessor = require('../services/templateProcessor');
  return await templateProcessor.process(text, contexts);
};

// Helper: Actually send the email via nodemailer
const deliverEmail = async ({ to, subject, body, fromName = "TaskVerse", toName = "User", contexts = {} }) => {
  // Use TemplateProcessor for final deliveries
  const processedSubject = await resolveText(subject, contexts);
  const processedBody = await resolveText(body, contexts);

  const mailOptions = {
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    subject: processedSubject,
    html: processedBody,
    text: processedBody.replace(/<[^>]+>/g, ''),
  };
  return transporter.sendMail(mailOptions);
};

// Schedule Email using setTimeout (fires EXACTLY once at the right time)
const scheduleEmailWithTimeout = async (emailData, scheduledDate, logId) => {
  const { to, subject, body, fromName = "TaskVerse", contexts = {} } = emailData;

  const now = new Date();
  const delayMs = scheduledDate.getTime() - now.getTime();

  if (delayMs <= 0) {
    throw new Error("Scheduled time must be in the future");
  }

  console.log(`📅 Email to ${to} scheduled in ${Math.round(delayMs / 1000)}s (at ${scheduledDate.toLocaleString('en-IN')})`);

  // setTimeout fires exactly once after delayMs
  setTimeout(async () => {
    try {
      const info = await deliverEmail({ to, subject, body, fromName, contexts });

      // Update DB log: mark as Sent
      if (logId) {
        await db.execute(
          `UPDATE email_logs SET status = 'Success', message_id = ? WHERE id = ?`,
          [info.messageId, logId]
        );
      }

      console.log(`✅ Scheduled email delivered to ${to} | messageId: ${info.messageId}`);
    } catch (error) {
      console.error(`❌ Scheduled email to ${to} failed:`, error.message);

      if (logId) {
        await db.execute(
          `UPDATE email_logs SET status = 'Failed', error_message = ? WHERE id = ?`,
          [error.message, logId]
        );
      }
    }
  }, delayMs);
};



// Send Email Controller (with Scheduling Support)
const sendEmail = async (req, res) => {
  const { to, subject, body, fromName = "TaskVerse", scheduleAt, customer_id, task_id, document_id, manual_vars } = req.body;
  const contexts = { customer_id, task_id, document_id, manual_vars };

  try {
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: to, subject, body" 
      });
    }

    // ── SCHEDULED SEND ───────────────────────────────────────────────
    if (scheduleAt) {
      const scheduledDate = new Date(scheduleAt);
      const now = new Date();

      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid scheduleAt date format" });
      }

      if (scheduledDate <= now) {
        return res.status(400).json({ 
          success: false, 
          message: "Scheduled time must be in the future" 
        });
      }

      // Save as 'Scheduled' in DB first
      const [result] = await db.execute(
        `INSERT INTO email_logs (sender, recipient, subject, body, status, gateway, scheduled_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [process.env.SMTP_USER || 'system', to, subject, body, 'Scheduled', 'Gmail', scheduledDate]
      );
      const logId = result.insertId;

      // Register the timeout
      await scheduleEmailWithTimeout({ to, subject, body, fromName, contexts }, scheduledDate, logId);

      return res.status(200).json({
        success: true,
        message: `Email scheduled successfully for ${scheduledDate.toLocaleString('en-IN')}`,
        scheduled: true,
        scheduledTime: scheduledDate
      });
    }

    // ── IMMEDIATE SEND ────────────────────────────────────────────────
    const info = await deliverEmail({ to, subject, body, fromName, contexts });

    // Save success log
    await db.execute(
      `INSERT INTO email_logs (sender, recipient, subject, body, status, gateway, message_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [process.env.SMTP_USER || 'system', to, subject, body, 'Success', 'Gmail', info.messageId]
    );

    console.log(`✅ Email sent immediately to ${to}`);

    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      messageId: info.messageId
    });

  } catch (error) {
    console.error("Send email error:", error);

    try {
      await db.execute(
        `INSERT INTO email_logs (sender, recipient, subject, body, status, gateway, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [process.env.SMTP_USER || 'system', to || '', subject || '', body || '', 'Failed', 'Gmail', error.message]
      );
    } catch (dbErr) {
      console.error("DB log error:", dbErr.message);
    }

    res.status(500).json({
      success: false,
      message: "Failed to send/schedule email",
      error: error.message
    });
  }
};

// Get Email Logs Controller
const getEmailLogs = async (req, res) => {
  try {
    console.log("Fetching email logs...");

    const [logs] = await db.execute(`
      SELECT 
        id, sender, recipient AS \`to\`, subject, body, status, 
        gateway, error_message, message_id, scheduled_at, created_at AS timestamp
      FROM email_logs 
      ORDER BY created_at DESC 
      LIMIT 100
    `);

    console.log(`Found ${logs.length} email logs`);

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      sender: log.sender || "System",
      to: log.to || "",
      subject: log.subject || "(No Subject)",
      date: getRelativeTime(log.timestamp),
      status: log.status || "Success",
      gateway: log.gateway || "Gmail",
      type: "SMTP",
      scheduledAt: log.scheduled_at ? new Date(log.scheduled_at).toLocaleString('en-IN') : null,
      content: log.body 
        ? (log.body.length > 180 ? log.body.substring(0, 180) + "..." : log.body)
        : (log.error_message || "No content"),
      timestamp: new Date(log.timestamp).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        year: 'numeric', hour: 'numeric', minute: '2-digit'
      }),
      error: log.error_message
    }));

    res.json({ success: true, logs: formattedLogs });

  } catch (error) {
    console.error("❌ CRITICAL ERROR in getEmailLogs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email logs",
      error: error.message
    });
  }
};

module.exports = { sendEmail, getEmailLogs };