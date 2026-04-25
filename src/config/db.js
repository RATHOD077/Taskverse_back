const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,     
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT), 
  connectionLimit: 10,
  waitForConnections: true,
  dateStrings: true,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('⚠️ Ensure DB_USER, DB_PASSWORD, and DB_NAME are correct in your .env or cPanel settings.');
  } else {
    console.log('✅ MySQL Connected successfully');
    connection.release();
  }
});

module.exports = db.promise();   // using promise version (cleaner code)