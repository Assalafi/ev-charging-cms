const express = require('express');
const { Op, fn, col } = require('sequelize');
const { User, Location, PaymentSettings, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission, hasPermission } = require('../../middleware/permissions');
const {
  PAGE_PERMISSIONS,
  ROLE_PERMISSIONS,
  ADMIN_ROLES,
  VALID_PERMISSIONS,
  normalizePermissionList,
  getEffectivePermissions
} = require('../../config/accessControl');
const logger = require('../../utils/logger');

const router = express.Router();
const ADMIN_ROLE_VALUES = new Set(ADMIN_ROLES.map(role => role.value));
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara'
];

function presentUser(user) {
  const data = typeof user.toJSON === 'function' ? user.toJSON() : user;
  const { password, ...safe } = data;
  return { ...safe, effectivePermissions: getEffectivePermissions(data) };
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedScope(role, scopeType, managedStates) {
  if (role !== 'manager' || scopeType !== 'states') return { scopeType: 'all', managedStates: [] };
  const states = [...new Set((Array.isArray(managedStates) ? managedStates : []).map(cleanText).filter(Boolean))];
  return { scopeType: 'states', managedStates: states };
}

function validateRole(actor, role) {
  if (!ADMIN_ROLE_VALUES.has(role)) return 'Invalid administrative role';
  if (role === 'super_admin' && actor.role !== 'super_admin') return 'Only a super administrator can assign that role';
  return null;
}

function validatePermissions(actor, permissions) {
  if (!Array.isArray(permissions)) return 'Permissions must be an array';
  const invalid = permissions.filter(permission => !VALID_PERMISSIONS.has(permission) || permission === 'partner.portal');
  if (invalid.length) return `Unknown permission: ${invalid[0]}`;
  if (actor.role !== 'super_admin') {
    const unauthorized = permissions.find(permission => !hasPermission(actor, permission));
    if (unauthorized) return `You cannot grant the ${unauthorized} permission`;
  }
  return null;
}

router.get('/metadata', authenticate, requirePermission('admin_users.view'), async (req, res) => {
  try {
    const rows = await Location.findAll({
      attributes: [[fn('DISTINCT', col('state')), 'state']],
      where: { state: { [Op.ne]: null } },
      raw: true
    });
    const states = [...new Set([...NIGERIAN_STATES, ...rows.map(row => cleanText(row.state)).filter(Boolean)])]
      .sort((a, b) => a.localeCompare(b));
    const roles = ADMIN_ROLES.filter(role => req.user.role === 'super_admin' || role.value !== 'super_admin');

    res.json({
      success: true,
      roles,
      states,
      pages: PAGE_PERMISSIONS,
      rolePresets: Object.fromEntries(roles.map(role => [role.value, ROLE_PERMISSIONS[role.value] || []]))
    });
  } catch (error) {
    logger.error('Failed to load admin-user metadata:', error);
    res.status(500).json({ success: false, message: 'Failed to load access-control options' });
  }
});

router.get('/', authenticate, requirePermission('admin_users.view'), async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const where = { partnerId: null, role: { [Op.in]: [...ADMIN_ROLE_VALUES] } };
    const search = cleanText(req.query.search);
    if (search) {
      where[Op.or] = ['username', 'email', 'fullName'].map(field => ({ [field]: { [Op.iLike]: `%${search}%` } }));
    }
    if (req.query.role && ADMIN_ROLE_VALUES.has(req.query.role)) where.role = req.query.role;
    if (req.query.active === 'true') where.active = true;
    if (req.query.active === 'false') where.active = false;
    if (['all', 'states'].includes(req.query.scopeType)) where.scopeType = req.query.scopeType;

    const [{ count, rows }, summaryRows] = await Promise.all([User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['active', 'DESC'], ['fullName', 'ASC'], ['username', 'ASC']],
      limit,
      offset: (page - 1) * limit
    }), User.findAll({
      where: { partnerId: null, role: { [Op.in]: [...ADMIN_ROLE_VALUES] } },
      attributes: ['role', 'active', 'scopeType'],
      raw: true
    })]);

    const summary = summaryRows.reduce((totals, item) => ({
      total: totals.total + 1,
      active: totals.active + (item.active ? 1 : 0),
      managers: totals.managers + (item.role === 'manager' ? 1 : 0),
      stateManagers: totals.stateManagers + (item.role === 'manager' && item.scopeType === 'states' ? 1 : 0)
    }), { total: 0, active: 0, managers: 0, stateManagers: 0 });

    res.json({
      success: true,
      users: rows.map(presentUser),
      summary,
      pagination: { page, limit, total: count, pages: Math.max(Math.ceil(count / limit), 1) }
    });
  } catch (error) {
    logger.error('Failed to fetch admin users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin users' });
  }
});

router.post('/', authenticate, requirePermission('admin_users.manage'), async (req, res) => {
  try {
    const username = cleanText(req.body.username);
    const email = cleanText(req.body.email).toLowerCase();
    const fullName = cleanText(req.body.fullName) || null;
    const password = String(req.body.password || '');
    const role = req.body.role || 'viewer';
    const roleError = validateRole(req.user, role);
    if (roleError) return res.status(400).json({ success: false, message: roleError });
    if (!username || !email || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Username, valid email and a password of at least 8 characters are required' });
    }
    const permissions = normalizePermissionList(req.body.permissions);
    const permissionError = validatePermissions(req.user, permissions);
    if (permissionError) return res.status(400).json({ success: false, message: permissionError });
    const scope = normalizedScope(role, req.body.scopeType, req.body.managedStates);
    if (scope.scopeType === 'states' && !scope.managedStates.length) {
      return res.status(400).json({ success: false, message: 'Select at least one state for a state-limited manager' });
    }
    const duplicate = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (duplicate) return res.status(409).json({ success: false, message: 'That username or email is already in use' });

    const user = await User.create({ username, email, fullName, password, role, permissions, ...scope, active: req.body.active !== false, partnerId: null });
    logger.info(`Administrative user ${username} created by ${req.user.username}`);
    res.status(201).json({ success: true, message: 'Administrative user created', user: presentUser(user) });
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    if (error.name === 'SequelizeValidationError') return res.status(400).json({ success: false, message: error.errors?.[0]?.message || 'Invalid user details' });
    res.status(500).json({ success: false, message: 'Failed to create administrative user' });
  }
});

router.put('/:id', authenticate, requirePermission('admin_users.manage'), async (req, res) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, partnerId: null } });
    if (!user || !ADMIN_ROLE_VALUES.has(user.role)) return res.status(404).json({ success: false, message: 'Administrative user not found' });
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Only a super administrator can edit this account' });

    const role = req.body.role || user.role;
    const roleError = validateRole(req.user, role);
    if (roleError) return res.status(400).json({ success: false, message: roleError });
    if (Number(req.user.id) === Number(user.id) && (role !== user.role || req.body.active === false)) {
      return res.status(400).json({ success: false, message: 'You cannot demote or disable your own account' });
    }

    const username = cleanText(req.body.username || user.username);
    const email = cleanText(req.body.email || user.email).toLowerCase();
    const duplicate = await User.findOne({ where: { id: { [Op.ne]: user.id }, [Op.or]: [{ username }, { email }] } });
    if (duplicate) return res.status(409).json({ success: false, message: 'That username or email is already in use' });

    const permissions = normalizePermissionList(req.body.permissions);
    const permissionError = validatePermissions(req.user, permissions);
    if (permissionError) return res.status(400).json({ success: false, message: permissionError });
    const scope = normalizedScope(role, req.body.scopeType, req.body.managedStates);
    if (scope.scopeType === 'states' && !scope.managedStates.length) {
      return res.status(400).json({ success: false, message: 'Select at least one state for a state-limited manager' });
    }

    const changes = {
      username,
      email,
      fullName: cleanText(req.body.fullName) || null,
      role,
      permissions,
      active: req.body.active !== false,
      ...scope
    };
    if (req.body.password) {
      if (String(req.body.password).length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      changes.password = String(req.body.password);
    }
    await user.update(changes);
    logger.info(`Administrative user ${username} updated by ${req.user.username}`);
    res.json({ success: true, message: 'Administrative user updated', user: presentUser(user) });
  } catch (error) {
    logger.error('Failed to update admin user:', error);
    if (error.name === 'SequelizeValidationError') return res.status(400).json({ success: false, message: error.errors?.[0]?.message || 'Invalid user details' });
    res.status(500).json({ success: false, message: 'Failed to update administrative user' });
  }
});

router.delete('/:id', authenticate, requirePermission('admin_users.manage'), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findOne({ where: { id: req.params.id, partnerId: null }, transaction });
    if (!user || !ADMIN_ROLE_VALUES.has(user.role)) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Administrative user not found' });
    }
    if (Number(req.user.id) === Number(user.id)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Only a super administrator can delete this account' });
    }
    if (user.role === 'super_admin') {
      const remaining = await User.count({ where: { role: 'super_admin', active: true, id: { [Op.ne]: user.id } }, transaction });
      if (!remaining) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'The final active super administrator cannot be deleted' });
      }
    }

    await PaymentSettings.update({ updatedBy: null }, { where: { updatedBy: user.id }, transaction });
    await user.destroy({ transaction });
    await transaction.commit();
    logger.info(`Administrative user ${user.username} deleted by ${req.user.username}`);
    res.json({ success: true, message: 'Administrative user deleted' });
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to delete admin user:', error);
    res.status(500).json({ success: false, message: 'Failed to delete administrative user safely' });
  }
});

module.exports = router;
