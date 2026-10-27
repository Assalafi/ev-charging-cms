const {
  isCanonicalChargerTag,
  normaliseTag,
  tagAliases,
  mobileUserTagWhere
} = require('../chargerTagService');
const { Op } = require('sequelize');

describe('chargerTagService', () => {
  test('accepts only the vendor D plus nine hexadecimal format', () => {
    expect(isCanonicalChargerTag('D1407A34DF')).toBe(true);
    expect(isCanonicalChargerTag('d1407a34df')).toBe(true);
    expect(isCanonicalChargerTag('MOB8034348368')).toBe(false);
    expect(isCanonicalChargerTag('D1407A34D')).toBe(false);
    expect(isCanonicalChargerTag('D1407A34DG')).toBe(false);
  });

  test('normalises only for comparisons and preserves both aliases', () => {
    expect(normaliseTag(' d1407a34df ')).toBe('D1407A34DF');
    expect(tagAliases({ tagId: 'D1407A34DF', legacyTagId: 'MOB8034348368' })).toEqual([
      'D1407A34DF',
      'MOB8034348368'
    ]);
    expect(tagAliases({ tagId: 'D1407A34DF', legacyTagId: 'D1407A34DF' })).toEqual(['D1407A34DF']);
  });

  test('resolves a lookup against either current or historical tag', () => {
    const where = mobileUserTagWhere('MOB8034348368');
    expect(where[Op.or]).toEqual([
      { tagId: 'MOB8034348368' },
      { legacyTagId: 'MOB8034348368' }
    ]);
  });
});
