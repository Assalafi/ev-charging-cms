const { ROLE_PERMISSIONS, getEffectivePermissions } = require('../config/accessControl');

function hasPermission(user, permission) {
  const permissions = getEffectivePermissions(user);
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
}

module.exports = { ROLE_PERMISSIONS, hasPermission, requirePermission };
