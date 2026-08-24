const { hasPermission, requirePermission } = require('../permissions');

describe('permissions middleware', () => {
  test('super admin has every permission', () => {
    expect(hasPermission({ role: 'super_admin' }, 'anything.at.all')).toBe(true);
  });

  test('roles cannot use permissions outside their matrix', () => {
    expect(hasPermission({ role: 'viewer' }, 'partners.delete')).toBe(false);
    expect(hasPermission({ role: 'finance' }, 'settlements.mark_paid')).toBe(true);
  });

  test('returns 403 instead of calling next when permission is denied', () => {
    const req = { user: { role: 'viewer' } };
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };
    const next = jest.fn();

    requirePermission('partners.delete')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });
});
