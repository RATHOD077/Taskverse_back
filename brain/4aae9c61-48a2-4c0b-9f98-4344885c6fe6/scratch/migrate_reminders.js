const path = require('path');
// Load environment variables from backend/.env
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });

const dbPath = path.resolve(__dirname, '../../../backend/src/config/db');
const db = require(dbPath);

async function migrate() {
  try {
    console.log('Starting migrations...');

    // 1. Add dob to user table
    console.log('Adding dob to user table...');
    try {
      await db.query(`ALTER TABLE user ADD COLUMN dob DATE AFTER contact`);
      console.log('Column dob added to user table.');
    } catch (colErr) {
      if (colErr.code === 'ER_DUP_FIELDNAME') {
        console.log('Column dob already exists in user table.');
      } else {
        throw colErr;
      }
    }

    // 2. Create automatic_reminders table
    console.log('Creating automatic_reminders table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS automatic_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL UNIQUE,
        template_id INT DEFAULT NULL,
        is_enabled TINYINT(1) DEFAULT 0,
        run_time TIME DEFAULT '09:00:00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE SET NULL
      )
    `);

    // 3. Insert default settings
    console.log('Inserting default reminder settings...');
    await db.query(`
      INSERT IGNORE INTO automatic_reminders (type, is_enabled)
      VALUES 
        ('birthday_client', 0),
        ('birthday_employee', 0)
    `);

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
