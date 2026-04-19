const cron = require('node-cron');
const reminderService = require('../services/reminderService');

/**
 * Initializes the daily cron job.
 * Schedule: Every day at 8:00 AM  → '0 8 * * *'
 * This scheduler now delegates ALL automated checks to the ReminderService
 * so that they can be managed via the Admin UI.
 */
const initScheduler = () => {
  // We initialize the reminder service schema at startup
  reminderService.init();

  cron.schedule('0 8 * * *', async () => {
    console.log(`\n[Scheduler] ⏰ Daily automation check started at ${new Date().toLocaleString()}`);
    
    // Run all enabled automated reminders (Birthdays, Document Expiry, Task Reminders)
    await reminderService.checkAllReminders();

    console.log('[Scheduler] ✅ Daily automation check complete.\n');
  }, {
    timezone: 'Asia/Kolkata'   // IST timezone
  });

  console.log('📅 Notification scheduler initialized — runs daily at 8:00 AM IST');
};

module.exports = { initScheduler };
