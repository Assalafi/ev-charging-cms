const {
  getPartnerDateRange,
  lagosDateKey,
  parseDateOnly
} = require('../partnerDateRange');

describe('partnerDateRange', () => {
  test('daily range starts at midnight in Africa/Lagos', () => {
    const now = new Date('2026-07-03T14:30:00.000Z');
    const result = getPartnerDateRange({ range: 'daily' }, now);

    expect(result.start.toISOString()).toBe('2026-07-02T23:00:00.000Z');
    expect(result.end).toBe(now);
  });

  test('weekly range starts on Monday in Africa/Lagos', () => {
    const now = new Date('2026-07-03T14:30:00.000Z');
    const result = getPartnerDateRange({ range: 'weekly' }, now);

    expect(result.start.toISOString()).toBe('2026-06-28T23:00:00.000Z');
  });

  test('custom range includes the complete Lagos end date', () => {
    const result = getPartnerDateRange({
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    expect(result.start.toISOString()).toBe('2026-05-31T23:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-06-30T22:59:59.999Z');
  });

  test('rejects invalid calendar dates and reversed ranges', () => {
    expect(() => parseDateOnly('2026-02-30')).toThrow('Invalid calendar date');
    expect(() => getPartnerDateRange({
      startDate: '2026-07-03',
      endDate: '2026-07-01'
    })).toThrow('startDate must be before endDate');
  });

  test('produces Lagos date keys around UTC midnight', () => {
    expect(lagosDateKey('2026-07-02T23:30:00.000Z')).toBe('2026-07-03');
  });
});
