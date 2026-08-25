const PAGE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', description: 'Network and commercial overview', path: '/dashboard', permissions: ['dashboard.view'] },
  { key: 'monitor', label: 'Live monitor', description: 'Live map, station health and location performance', path: '/monitor', permissions: ['monitor.view'] },
  { key: 'stations', label: 'Stations', description: 'Charging stations, connectors and remote controls', path: '/stations', permissions: ['stations.view', 'stations.create', 'stations.update', 'stations.delete', 'stations.monitor', 'stations.remote_control'] },
  { key: 'transactions', label: 'Transactions', description: 'Charging sessions, details and reconciliation', path: '/transactions', permissions: ['transactions.view', 'transactions.manage'] },
  { key: 'mobile_users', label: 'Mobile users', description: 'Customer accounts and access status', path: '/mobile-users', permissions: ['mobile_users.view', 'mobile_users.manage'] },
  { key: 'locations', label: 'Locations', description: 'Charging locations and station assignment', path: '/locations', permissions: ['locations.view', 'locations.create', 'locations.update', 'locations.assign_partner', 'locations.unassign_partner'] },
  { key: 'payments', label: 'Payments', description: 'Wallets, payment transactions and funding', path: '/payments', permissions: ['payments.view', 'payments.manage'] },
  { key: 'partners', label: 'Partners', description: 'Partner companies, users and location ownership', path: '/partners', permissions: ['partners.view', 'partners.create', 'partners.update', 'partners.suspend', 'partners.delete', 'partners.assign_locations', 'partners.manage_users'] },
  { key: 'settlements', label: 'Settlements', description: 'Partner settlement generation and approval', path: '/settlements', permissions: ['settlements.view', 'settlements.generate', 'settlements.approve', 'settlements.mark_paid', 'settlements.cancel', 'settlements.export'] },
  { key: 'ads', label: 'Ads board', description: 'Mobile application campaign content', path: '/ads-board', permissions: ['ads.view', 'ads.manage'] },
  { key: 'settings', label: 'Settings', description: 'System, OCPP and notification settings', path: '/settings', permissions: ['settings.view', 'settings.manage'] },
  { key: 'app_updates', label: 'App update', description: 'Mobile application releases', path: '/app-update', permissions: ['app_updates.view', 'app_updates.manage'] },
  { key: 'admin_users', label: 'Admin users', description: 'Administrative accounts, roles and access', path: '/admin-users', permissions: ['admin_users.view', 'admin_users.manage'] }
];

const allPagePermissions = PAGE_PERMISSIONS.flatMap(page => page.permissions);
const readOnlyPermissions = PAGE_PERMISSIONS.map(page => page.permissions[0]);

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [...allPagePermissions],
  manager: [
    'dashboard.view', 'monitor.view', 'stations.view', 'stations.monitor',
    'transactions.view', 'mobile_users.view', 'locations.view'
  ],
  finance: ['dashboard.view', 'monitor.view', 'transactions.view', 'payments.view', 'payments.manage', 'partners.view', 'settlements.view', 'settlements.generate', 'settlements.mark_paid', 'settlements.export'],
  operations: ['dashboard.view', 'monitor.view', 'locations.view', 'locations.create', 'locations.update', 'stations.view', 'stations.create', 'stations.update', 'stations.monitor', 'stations.remote_control', 'transactions.view'],
  operator: ['dashboard.view', 'monitor.view', 'locations.view', 'locations.update', 'stations.view', 'stations.update', 'stations.monitor', 'stations.remote_control', 'transactions.view'],
  technician: ['dashboard.view', 'monitor.view', 'locations.view', 'stations.view', 'stations.monitor', 'stations.remote_control', 'transactions.view'],
  support: ['dashboard.view', 'monitor.view', 'locations.view', 'stations.view', 'stations.monitor', 'transactions.view', 'mobile_users.view'],
  viewer: [...readOnlyPermissions.filter(permission => permission !== 'admin_users.view')],
  partner_owner: ['partner.portal'],
  partner_manager: ['partner.portal'],
  partner_finance: ['partner.portal'],
  partner_viewer: ['partner.portal'],
  customer: []
};

const ADMIN_ROLES = [
  { value: 'super_admin', label: 'Super administrator', description: 'Complete system and access-control authority' },
  { value: 'admin', label: 'Administrator', description: 'Full operational access except protected super-admin actions' },
  { value: 'manager', label: 'Manager', description: 'Custom page access with optional state-level scope' },
  { value: 'finance', label: 'Finance', description: 'Payments, transactions and settlements' },
  { value: 'operations', label: 'Operations', description: 'Charging network day-to-day operations' },
  { value: 'operator', label: 'Operator (legacy)', description: 'Existing network operator access' },
  { value: 'technician', label: 'Technician', description: 'Station monitoring and remote support' },
  { value: 'support', label: 'Support', description: 'Read access for customer and station support' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to assigned pages' }
];

const VALID_PERMISSIONS = new Set(['*', 'partner.portal', ...allPagePermissions]);

function normalizePermissionList(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter(permission => VALID_PERMISSIONS.has(permission)))];
}

function getEffectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'super_admin') return ['*'];
  const custom = normalizePermissionList(user.permissions);
  return custom === null ? (ROLE_PERMISSIONS[user.role] || []) : custom;
}

module.exports = {
  PAGE_PERMISSIONS,
  ROLE_PERMISSIONS,
  ADMIN_ROLES,
  VALID_PERMISSIONS,
  normalizePermissionList,
  getEffectivePermissions
};
