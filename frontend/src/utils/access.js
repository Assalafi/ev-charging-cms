export const adminPages = [
  ['dashboard.view', '/dashboard'],
  ['monitor.view', '/monitor'],
  ['stations.view', '/stations'],
  ['transactions.view', '/transactions'],
  ['mobile_users.view', '/mobile-users'],
  ['locations.view', '/locations'],
  ['payments.view', '/payments'],
  ['partners.view', '/partners'],
  ['settlements.view', '/settlements'],
  ['ads.view', '/ads-board'],
  ['admin_users.view', '/admin-users'],
  ['settings.view', '/settings'],
  ['app_updates.view', '/app-update']
];

export function adminHomePath(user) {
  if (user?.role === 'super_admin') return '/dashboard';
  const permissions = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
  return adminPages.find(([permission]) => permissions.includes('*') || permissions.includes(permission))?.[1] || '/profile';
}
