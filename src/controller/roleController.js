// backend/src/controller/roleController.js
const db = require('../config/db');
const { getPagination, getPagingMeta } = require('../utils/pagination');

async function ensureRolePermissionsTable() {
  // Auto-create table if it doesn't exist (no migrations in repo).
  await db.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_id INT NOT NULL,
      permission_key VARCHAR(191) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_role_perm (role_id, permission_key),
      INDEX idx_role (role_id)
    )
  `);
}

// A simple permission catalog that matches your UI modules.
// You can extend this list anytime without DB changes.
const PERMISSION_CATALOG = [
  {
    module: 'Dashboard',
    permissions: ['dashboard.view', 'dashboard.manage']
  },
  {
    module: 'Users',
    permissions: [
      'users.view',
      'users.create',
      'users.edit',
      'users.delete',
      'users.reset_password',
      'users.manage_all',
      'users.manage_own'
    ]
  },
  {
    module: 'Roles',
    permissions: [
      'roles.view',
      'roles.create',
      'roles.edit',
      'roles.delete',
      'roles.manage_all',
      'roles.manage_own'
    ]
  },
  {
    module: 'Media',
    permissions: [
      'media.view',
      'media.create',
      'media.edit',
      'media.delete',
      'media.download',
      'media.manage_all',
      'media.manage_own'
    ]
  },
  {
    module: 'Clients',
    permissions: [
      'clients.view',
      'clients.create',
      'clients.edit',
      'clients.delete',
      'clients.reset_password',
      'clients.manage_all',
      'clients.manage_own'
    ]
  },
  {
    module: 'Client Documents',
    permissions: [
      'client_documents.view',
      'client_documents.create',
      'client_documents.edit',
      'client_documents.delete',
      'client_documents.download',
      'client_documents.manage_all',
      'client_documents.manage_own'
    ]
  },
  {
    module: 'Document Categories',
    permissions: [
      'document_categories.view',
      'document_categories.create',
      'document_categories.edit',
      'document_categories.delete',
      'document_categories.manage_all',
      'document_categories.manage_own'
    ]
  }
];

// Get all roles
exports.getAllRoles = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM roles');
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      'SELECT id, role_name AS name, description, created_at FROM roles ORDER BY role_name ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    res.json({
      success: true,
      roles: rows,
      pagination: getPagingMeta({ total, page, limit })
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create role
exports.createRole = async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });

  try {
    const [existing] = await db.query('SELECT id FROM roles WHERE role_name = ?', [name]);
    if (existing.length > 0)
      return res.status(409).json({ message: 'Role already exists' });

    const [result] = await db.query(
      'INSERT INTO roles (role_name, description) VALUES (?, ?)',
      [name, description || null]
    );
    res.status(201).json({ success: true, message: 'Role created', roleId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update role
exports.updateRole = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE roles SET role_name=?, description=? WHERE id=?',
      [name, description || null, id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Role not found' });
    res.json({ success: true, message: 'Role updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete role
exports.deleteRole = async (req, res) => {
  const { id } = req.params;
  try {
    // Check if any user is using this role
    const [users] = await db.query(
      'SELECT id FROM user WHERE role_id = ?',
      [id]
    );
    if (users.length > 0)
      return res.status(409).json({ message: `Cannot delete — ${users.length} user(s) assigned to this role` });

    const [result] = await db.query('DELETE FROM roles WHERE id=?', [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Role not found' });
    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Role permissions (catalog + get/set)
exports.getPermissionsCatalog = async (req, res) => {
  return res.json({ success: true, modules: PERMISSION_CATALOG });
};

exports.getRolePermissions = async (req, res) => {
  const { id } = req.params;
  try {
    await ensureRolePermissionsTable();
    const [rows] = await db.query(
      'SELECT permission_key FROM role_permissions WHERE role_id = ?',
      [id]
    );
    res.json({ success: true, roleId: Number(id), permissions: rows.map(r => r.permission_key) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.setRolePermissions = async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body || {};

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: 'permissions must be an array' });
  }

  const unique = Array.from(new Set(permissions.map(p => String(p).trim()).filter(Boolean)));

  try {
    await ensureRolePermissionsTable();

    // Replace all permissions for this role
    await db.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);

    if (unique.length > 0) {
      const values = unique.map(p => [id, p]);
      await db.query('INSERT INTO role_permissions (role_id, permission_key) VALUES ?', [values]);
    }

    res.json({ success: true, message: 'Role permissions updated', roleId: Number(id), count: unique.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
