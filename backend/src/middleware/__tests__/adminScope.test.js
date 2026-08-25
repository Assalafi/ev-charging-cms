const { canAccessState, isStateRestricted, normalizedStates } = require('../adminScope');

describe('administrative state scope', () => {
  test('all-state users can access every state', () => {
    const user = { scopeType: 'all', managedStates: [] };
    expect(isStateRestricted(user)).toBe(false);
    expect(canAccessState(user, 'Lagos')).toBe(true);
  });

  test('state managers are limited case-insensitively to assigned states', () => {
    const user = { scopeType: 'states', managedStates: ['FCT Abuja', ' Lagos ', 'Lagos'] };
    expect(normalizedStates(user)).toEqual(['FCT Abuja', 'Lagos']);
    expect(canAccessState(user, 'fct abuja')).toBe(true);
    expect(canAccessState(user, 'LAGOS')).toBe(true);
    expect(canAccessState(user, 'Kano')).toBe(false);
  });

  test('an empty restricted scope grants no state access', () => {
    expect(canAccessState({ scopeType: 'states', managedStates: [] }, 'Lagos')).toBe(false);
  });
});
