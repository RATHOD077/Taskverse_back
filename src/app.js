const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();


// Runs once at startup to add any missing columns without breaking existing data
const runMigrations = async () => {
  try {
    const db = require('./config/db');
    // Check task table
    const [taskCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task' AND COLUMN_NAME = 'folder_access'`
    );
    if (taskCols.length === 0) {
      await db.query('ALTER TABLE task ADD COLUMN folder_access TEXT NULL');
      console.log('✅ Added missing folder_access column to task table');
    }

    // Check user table for role column (Fix for 500 errors)
    const [userCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'role'`
    );
    if (userCols.length === 0) {
      await db.query("ALTER TABLE user ADD COLUMN role VARCHAR(50) DEFAULT 'employee'");
      console.log('✅ Added missing role column to user table');
    }

    // Check customer_doc table for critical columns
    const [docCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_doc' AND COLUMN_NAME = 'document_path'`
    );
    if (docCols.length === 0) {
      await db.query('ALTER TABLE customer_doc ADD COLUMN document_path TEXT NULL');
      console.log('✅ Added missing document_path column to customer_doc table');
    }
    console.log('✅ DB Migration: All checks completed');
  } catch (err) {
    console.warn('⚠️ DB Migration warning (non-fatal):', err.message);
  }
};

// Run migrations before starting server routes
const verifyDB = async () => {
  try {
    const db = require('./config/db');
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    console.log('✅ Database Connection Test: SUCCESS (1+1=' + rows[0].result + ')');
    await runMigrations();
  } catch (err) {
    console.error('❌ Database Connection Test: FAILED');
    console.error('   Error Trace:', err.message);
  }
};

verifyDB();

// CORS Configuration - Allow frontend to connect securely
const allowedOrigins = [
  'https://localhost:5173/'
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(','));
}
if (process.env.SHARE_FRONTEND_BASE_URL) {
  allowedOrigins.push(process.env.SHARE_FRONTEND_BASE_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Dynamic check
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('digitalarchives.co')) {
      callback(null, true);
    } else {
      console.warn('CORS Blocked for origin:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static('uploads'));

// ====================== DATABASE ======================
const db = require('./config/db');

// ====================== EMAIL SMTP SETUP ======================
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family: 4,
  tls: {
    rejectUnauthorized: true,
  }
});

// Verify SMTP
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP Connection Error:", error);
  } else {
    console.log("✅ SMTP Server is ready to send emails");
  }
});


const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const taskRoutes = require('./routes/taskRoutes');
const taskStageRoutes = require('./routes/taskStageRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const documentCategoryRoutes = require('./routes/documentCategoryRoutes');
const customerDocumentRoutes = require('./routes/customerDocumentRoutes');
const mediaLibraryRoutes = require('./routes/mediaLibraryRoutes');
const taskTypeRoutes = require('./routes/taskTypeRoutes');
const taskStatusRoutes = require('./routes/taskStatusRoutes');
const physicalFileRoutes = require('./routes/physicalFileRoutes');
const documentVersionRoutes = require('./routes/documentVersionRoutes');
const caseRoutes = require('./routes/caseRoutes');
const hearingRoutes = require('./routes/hearingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Email & SMS Routes
const emailRoutes = require('./routes/email');
const emailTemplateRoutes = require('./routes/templates');
const smsRoutes = require('./routes/smsRoutes');
const reminderRoutes = require('./routes/reminderRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/task-stages', taskStageRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/document-categories', documentCategoryRoutes);
app.use('/api/customer-documents', customerDocumentRoutes);
app.use('/api/media-library', mediaLibraryRoutes);
app.use('/api/task-types', taskTypeRoutes);
app.use('/api/task-statuses', taskStatusRoutes);
app.use('/api/physical-files', physicalFileRoutes);
app.use('/api/document-versions', documentVersionRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/hearings', hearingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reminders', reminderRoutes);

// Notification Routes (Email/SMS)
app.use('/api', emailRoutes);   // This will handle /api/send-email and /api/email-logs
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api', smsRoutes);     // This will handle /api/send-sms and /api/sms-logs

// Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TaskVerse Backend Running Successfully',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message || 'Unknown error'
  });
});

const PORT = process.env.PORT || 5000;

module.exports = app;