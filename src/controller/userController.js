/**
 * userController.js
 * Handles all user-related operations including:
 * - User Login (Employee, Customer, Receptionist)
 * - Admin CRUD operations for users
 * - User-specific actions
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

const JWT_SECRET = process.env.JWT_SECRET || 'tasksarsnkg,mfnfvajdngkjnbskjnfdkjfnkjvnfjakdngkjkjdzkfjfvkjkjgjvkjad';

/**
 * User Login
 * Authenticates users from the 'user' table (Employee, Customer, Receptionist)
 * Fetches role information and returns JWT token
 * @route POST /api/users/login
 */
exports.userLogin = async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    // Fetch user along with role details
    const [rows] = await db.query(
      `SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.password, 
        u.status, 
        u.profile_photo,
        r.id AS role_id, 
        r.role_name 
       FROM user u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = ?`,
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email is not valid'
      });
    }

    const user = rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password is not valid'
      });
    }

    // Generate JWT token with role
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role_name || 'user'
      },
      JWT_SECRET,
      { expiresIn: '365d' }  // 1 year — only logout clears the session
    );

    // Send success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        profile_photo: user.profile_photo,
        role_id: user.role_id,
        role_name: user.role_name || 'user'
      }
    });

  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

/**
 * Get All Users (Admin only)
 * Retrieves list of all active users with role information
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM user');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.contact, u.status, u.profile_photo,
              u.created_at, r.id AS role_id, r.role_name AS role_name
       FROM user u
       LEFT JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      success: true,
      users: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Create New User (Admin only)
 */
exports.createUser = async (req, res) => {
  const { username, email, password, contact, role_id, status } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username, email and password are required'
    });
  }

  try {
    // Check duplicate email
    const [existing] = await db.query(
      'SELECT id FROM user WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO user (username, email, password, contact, role_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        contact ? contact.trim() : null,
        role_id || null,
        status || 'pending'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Create user error:', error);

    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.message.includes('foreign key')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected. Please choose a valid role.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
};

/**
 * Update User (Admin only)
 */
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, email, contact, role_id, status, password } = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  try {
    let query, params;

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = `UPDATE user 
               SET username = ?, email = ?, contact = ?, role_id = ?, status = ?, password = ? 
               WHERE id = ?`;
      params = [
        username ? username.trim() : null,
        email ? email.trim().toLowerCase() : null,
        contact ? contact.trim() : null,
        role_id || null,
        status || 'pending',
        hashedPassword,
        id
      ];
    } else {
      query = `UPDATE user 
               SET username = ?, email = ?, contact = ?, role_id = ?, status = ? 
               WHERE id = ?`;
      params = [
        username ? username.trim() : null,
        email ? email.trim().toLowerCase() : null,
        contact ? contact.trim() : null,
        role_id || null,
        status || 'pending',
        id
      ];
    }

    const [result] = await db.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or already deleted'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);

    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.message.includes('foreign key')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected. Please choose a valid role.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
};

/**
 * Hard Delete User (Admin only)
 */
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM user WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get User's Own Tasks
 * Allows authenticated user to fetch tasks they created
 */
exports.getMyTasks = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query(
      'SELECT COUNT(*) AS total FROM task WHERE created_by = ?',
      [userId]
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT id, task_name, total_stages, required_time, priority, status, created_at, task_cost
       FROM task
       WHERE created_by = ? 
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      tasks: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};