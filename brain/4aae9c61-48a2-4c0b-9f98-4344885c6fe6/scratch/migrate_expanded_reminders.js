const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });

const dbPath = path.resolve(__dirname, '../../../backend/src/config/db');
const db = require(dbPath);

async function migrate() {
  try {
    console.log('Inserting expanded reminder settings...');
    
    const types = [
      { type: 'document_expiry_15d', is_enabled: 0 },
      { type: 'task_reminder_7d', is_enabled: 0 },
      { type: 'task_reminder_1d', is_enabled: 0 }
    ];

    for (const item of types) {
      await db.query(`
        INSERT IGNORE INTO automatic_reminders (type, is_enabled)
        VALUES (?, ?)
      `, [item.type, item.is_enabled]);
      console.log(`Ensured reminder type: ${item.type}`);
    }

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
