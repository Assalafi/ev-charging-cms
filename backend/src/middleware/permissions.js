const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'partners.view', 'partners.create', 'partners.update', 'partners.suspend',
    'partners.delete', 'partners.assign_locations', 'partners.manage_users',
    'locations.view', 'locations.create', 'locations.update', 'locations.assign_partner',
    'locations.unassign_partner', 'settlements.view', 'settlements.generate',
    'settlements.approve', 'settlements.mark_paid', 'settlements.cancel', 'settlements.export',
    'stations.view', 'stations.create', 'stations.update', 'stations.delete',
    'stations.remote_control', 'stations.monitor', 'monitor.view'
  ],
  finance: [
    'partners.view', 'settlements.view', 'settlements.generate',
    'settlements.mark_paid', 'settlements.export', 'monitor.view'
  ],
  operations: ['locations.view', 'stations.view', 'stations.monitor', 'stations.remote_control', 'monitor.view'],
  support: ['locations.view', 'stations.view', 'stations.monitor', 'monitor.view'],
  viewer: ['partners.view', 'settlements.view', 'locations.view', 'stations.view', 'monitor.view'],
  partner_owner: ['partner.portal'],
  partner_manager: ['partner.portal'],
  partner_finance: ['partner.portal'],
  partner_viewer: ['partner.portal']
};

function hasPermission(user, permission) {
  const permissions = ROLE_PERMISSIONS[user?.role] || [];
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
