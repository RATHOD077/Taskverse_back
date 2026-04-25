// server.js
require('dotenv').config();

const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[Backend] Live on Port: ${PORT}`);
  console.log(`[SMTP] Gateways ready.`);
  
  // Initialize Daily Automation Scheduler (Birthdays, Documents, Tasks)
  try {
    const { initScheduler } = require('./src/jobs/notificationScheduler');
    initScheduler();
  } catch (err) {
    console.error('[Error] Failed to initialize background scheduler:', err.message);
  }
});

module.exports = server;