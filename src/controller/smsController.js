// controllers/smsController.js
const dotenv = require('dotenv');
const db = require('../config/db');
const twilio = require('twilio');
const { getPagination, getPagingMeta } = require('../utils/pagination');

dotenv.config();

// Auto-migrate: create sms_logs table
(async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender VARCHAR(100) NOT NULL,
        recipient VARCHAR(50) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Success',
        gateway VARCHAR(50) DEFAULT 'Twilio',
        message_id VARCHAR(255),
        error_message TEXT,
        scheduled_at DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ sms_logs table ready");
  } catch (e) {
    console.log("ℹ️ sms_logs table check failed:", e.message);
  }
})();

// Create Twilio client
let twilioClient;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log("✅ Twilio client initialized");
  } else {
    console.warn("⚠️ Twilio credentials missing from .env. SMS will fail.");
  }
} catch (error) {
  console.error("❌ Twilio SDK error:", error.message);
}

// Helper: Actually send the SMS via Twilio
const deliverSms = async ({ to, body, fromNumber = process.env.TWILIO_PHONE_NUMBER || "TaskVerse" }) => {
  if (!twilioClient) {
    console.error(`[SMS FAILED] Twilio credentials missing. Tried sending from ${fromNumber} to ${to}: ${body}`);
    // DO NOT MOCK SUCCESS. Fails so user knows credentials are not configured.
    throw new Error("Twilio API credentials not configured in backend .env");
  }
  
  return await twilioClient.messages.create({
    body,
    from: fromNumber,
    to
  });
};


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

// Schedule SMS using setTimeout (fires EXACTLY once at the right time)
const scheduleSmsWithTimeout = async (smsData, scheduledDate, logId) => {
  const { to, body } = smsData;

  const now = new Date();
  const delayMs = scheduledDate.getTime() - now.getTime();

  if (delayMs <= 0) {
    throw new Error("Scheduled time must be in the future");
  }

  console.log(`📅 SMS to ${to} scheduled in ${Math.round(delayMs / 1000)}s (at ${scheduledDate.toLocaleString('en-IN')})`);

  // setTimeout fires exactly once after delayMs
  setTimeout(async () => {
    try {
      const info = await deliverSms({ to, body });

      // Update DB log: mark as Sent
      if (logId) {
        await db.execute(
          `UPDATE sms_logs SET status = 'Success', message_id = ? WHERE id = ?`,
          [info.sid, logId]
        );
      }

      console.log(`✅ Scheduled SMS delivered to ${to} | sid: ${info.sid}`);
    } catch (error) {
      console.error(`❌ Scheduled SMS to ${to} failed:`, error.message);

      if (logId) {
        await db.execute(
          `UPDATE sms_logs SET status = 'Failed', error_message = ? WHERE id = ?`,
          [error.message, logId]
        );
      }
    }
  }, delayMs);
};

// Send SMS Controller
const sendSms = async (req, res) => {
  const { to, body, scheduleAt, customer_id, task_id, document_id, manual_vars } = req.body;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || "TaskVerse";
  const contexts = { customer_id, task_id, document_id, manual_vars };

  try {
    if (!to || !body) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: to, body" 
      });
    }

    const templateProcessor = require('../services/templateProcessor');
    const processedBody = await templateProcessor.process(body, contexts);

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
        `INSERT INTO sms_logs (sender, recipient, body, status, gateway, scheduled_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fromNumber, to, body, 'Scheduled', 'Twilio', scheduledDate]
      );
      const logId = result.insertId;

      // Register the timeout (Passing processed body for final delivery)
      await scheduleSmsWithTimeout({ to, body: processedBody }, scheduledDate, logId);

      return res.status(200).json({
        success: true,
        message: `SMS scheduled successfully for ${scheduledDate.toLocaleString('en-IN')}`,
        scheduled: true,
        scheduledTime: scheduledDate
      });
    }

    // ── IMMEDIATE SEND ────────────────────────────────────────────────
    const info = await deliverSms({ to, body: processedBody });

    // Save success log
    await db.execute(
      `INSERT INTO sms_logs (sender, recipient, body, status, gateway, message_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fromNumber, to, body, 'Success', 'Twilio', info.sid]
    );

    console.log(`✅ SMS sent immediately to ${to}`);

    res.status(200).json({
      success: true,
      message: "SMS sent successfully",
      messageId: info.sid
    });

  } catch (error) {
    console.error("Send SMS error:", error);

    try {
      await db.execute(
        `INSERT INTO sms_logs (sender, recipient, body, status, gateway, error_message) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fromNumber, to || '', body || '', 'Failed', 'Twilio', error.message]
      );
    } catch (dbErr) {
      console.error("DB log error:", dbErr.message);
    }

    res.status(500).json({
      success: false,
      message: "Failed to send/schedule SMS",
      error: error.message
    });
  }
};

// Get SMS Logs Controller
const getSmsLogs = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const [countRows] = await db.execute('SELECT COUNT(*) AS total FROM sms_logs');
    const total = countRows[0]?.total || 0;

    const [logs] = await db.execute(`
      SELECT 
        id, sender, recipient AS \`to\`, body, status, 
        gateway, error_message, message_id, scheduled_at, created_at AS timestamp
      FROM sms_logs 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      sender: log.sender || "System",
      to: log.to || "",
      status: log.status || "Success",
      gateway: log.gateway || "Twilio",
      body: log.body,
      scheduledAt: log.scheduled_at ? new Date(log.scheduled_at).toLocaleString('en-IN') : null,
      timestamp: new Date(log.timestamp).toLocaleString('en-IN', {
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }),
      error: log.error_message
    }));

    res.json({
      success: true,
      logs: formattedLogs,
      pagination: getPagingMeta({ total, page, limit })
    });

  } catch (error) {
    console.error("❌ ERROR in getSmsLogs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch SMS logs",
      error: error.message
    });
  }
};

module.exports = { sendSms, getSmsLogs };
