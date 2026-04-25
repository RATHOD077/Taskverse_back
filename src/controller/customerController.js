/**
 * customerController.js
 * Handles Customer CRUD with automatic ID generation: C000001, C000002, ...
 */

const db = require('../config/db');
const bcrypt = require('bcrypt');
const { getPagination, getPagingMeta } = require('../utils/pagination');

/**
 * Get All Customers
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM customer');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(`
      SELECT id, name, contact, email, address, city, state, pincode,
             aadhar_card_number, pan_card_number, referred_by, dob, 
             added_by, created_at
      FROM customer
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({
      success: true,
      customers: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customers' 
    });
  }
};

/**
 * Get Customers for Employee (Assigned via cases or tasks)
 */
exports.getEmpCustomers = async (req, res) => {
  const empId = req.user?.id;
  try {
    const { page, limit, offset } = getPagination(req.query);

    const [countRows] = await db.query(`
      SELECT COUNT(DISTINCT cust.id) AS total
      FROM customer cust
      WHERE EXISTS (
        SELECT 1 FROM cases c
        WHERE c.client_id = cust.id
        AND c.assigned_to = ?
      )
      OR EXISTS (
        SELECT 1 FROM task t
        WHERE t.client_id = cust.id
        AND t.assigned_to = ?
      )
    `, [empId, empId]);
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(`
      SELECT DISTINCT 
        cust.id, cust.name, cust.contact, cust.email, cust.address, 
        cust.city, cust.state, cust.pincode, cust.aadhar_card_number, 
        cust.pan_card_number, cust.referred_by, cust.dob, 
        cust.added_by, cust.created_at
      FROM customer cust
      WHERE EXISTS (
        SELECT 1 FROM cases c 
        WHERE c.client_id = cust.id 
        AND c.assigned_to = ?
      )
      OR EXISTS (
        SELECT 1 FROM task t
        WHERE t.client_id = cust.id
        AND t.assigned_to = ?
      )
      ORDER BY cust.created_at DESC
      LIMIT ? OFFSET ?
    `, [empId, empId, limit, offset]);

    res.json({
      success: true,
      customers: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error('Get emp customers error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching your customers' 
    });
  }
};

/**
 * Get Customer By ID
 */
exports.getCustomerById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM customer WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, customer: rows[0] });
  } catch (err) {
    console.error('Get customer by ID error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Create New Customer with Auto ID (C000001, C000002, ...)
 */
exports.createCustomer = async (req, res) => {
  const {
    name, contact, email, address, city, state,
    pincode, aadhar_card_number, pan_card_number, 
    referred_by, dob
  } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Name is required'
    });
  }

  try {
    const added_by = req.user?.id || req.body.added_by || null;

    const [result] = await db.query(`
      INSERT INTO customer 
        (name, contact, email, address, city, state, pincode, 
         aadhar_card_number, pan_card_number, referred_by, dob, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name.trim(),
      contact ? contact.trim() : null,
      email ? email.toLowerCase().trim() : null,
      address || null,
      city || null,
      state || null,
      pincode || null,
      aadhar_card_number || null,
      pan_card_number || null,
      referred_by || null,
      dob || null,
      added_by
    ]);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customerId: result.insertId,
      customer: {
        id: result.insertId,
        name: name.trim(),
        contact: contact ? contact.trim() : null,
        email: email ? email.toLowerCase().trim() : null
      }
    });
  } catch (err) {

    console.error('Create customer error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while creating customer'
    });
  }
};

/**
 * Update Customer
 */
exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const {
    name, contact, email, address, city, state,
    pincode, aadhar_card_number, pan_card_number, 
    referred_by, dob, added_by
  } = req.body;

  try {
    const [result] = await db.query(`
      UPDATE customer 
      SET 
        name = ?,
        contact = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        pincode = ?,
        aadhar_card_number = ?,
        pan_card_number = ?,
        referred_by = ?,
        dob = ?,
        added_by = ?
      WHERE id = ?
    `, [
      name ? name.trim() : null,
      contact ? contact.trim() : null,
      email ? email.toLowerCase().trim() : null,
      address || null,
      city || null,
      state || null,
      pincode || null,
      aadhar_card_number || null,
      pan_card_number || null,
      referred_by || null,
      dob || null,
      added_by || null,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or already deleted'
      });
    }

    res.json({
      success: true,
      message: 'Customer updated successfully'
    });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while updating customer'
    });
  }
};

/**
 * Hard Delete Customer
 */
exports.deleteCustomer = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM customer WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting customer'
    });
  }
};