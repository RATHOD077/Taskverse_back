// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'tasksarsnkg,mfnfvajdngkjnbskjnfdkjfnkjvnfjakdngkjkjdzkfjfvkjkjgjvkjad';

exports.adminLogin = async (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt for:', email);   // ← Helpful for debugging

  try {
    const [admins] = await db.query(
      'SELECT id, admin_name, email, password FROM admin_user WHERE email = ?',
      [email]
    );

    if (admins.length === 0) {
      console.log('No admin found with email:', email);
      return res.status(401).json({ message: 'Email is not valid' });
    }

    const admin = admins[0];
    console.log('Stored hash length:', admin.password.length);

    const isMatch = await bcrypt.compare(password, admin.password);

    console.log('Password match result:', isMatch);   // ← This will tell us the truth

    if (!isMatch) {
      return res.status(401).json({ message: 'Password is not valid' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        admin_name: admin.admin_name,
        email: admin.email
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
// Reset Admin Password
exports.resetAdminPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email and new password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const [result] = await db.query(
      'UPDATE admin_user SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};