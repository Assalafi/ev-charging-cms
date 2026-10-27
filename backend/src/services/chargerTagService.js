const crypto = require('crypto');
const { Op } = require('sequelize');
const { MobileUser, AuthorizedTag } = require('../models');

// The charger vendor accepts a single-character prefix followed by nine
// hexadecimal characters (for example: D1407A34DF).  Keep this deliberately
// strict so a phone number, database id, or arbitrary user input is never sent
// to an OCPP charger as an idTag.
const CANONICAL_TAG_PATTERN = /^D[0-9A-F]{9}$/;

function normaliseTag(value) {
  return value === null || value === undefined ? '' : String(value).trim().toUpperCase();
}

function isCanonicalChargerTag(value) {
  return CANONICAL_TAG_PATTERN.test(normaliseTag(value));
}

function tagAliases(user) {
  return [...new Set([user?.tagId, user?.legacyTagId].filter(Boolean).map(String))];
}

function mobileUserTagWhere(tagId) {
  const value = String(tagId || '').trim();
  return {
    [Op.or]: [{ tagId: value }, { legacyTagId: value }]
  };
}

async function findMobileUserByTag(tagId, options = {}) {
  if (!tagId) return null;
  // Keeps pure ownership/OCPP tests and optional tooling usable when the
  // database model is intentionally stubbed; the production model always
  // exposes findOne.
  if (!MobileUser || typeof MobileUser.findOne !== 'function') return null;
  return MobileUser.findOne({ ...options, where: mobileUserTagWhere(tagId) });
}

async function tagExists(tagId, transaction) {
  const [mobileUser, authorizedTag] = await Promise.all([
    MobileUser.findOne({
      where: {
        [Op.or]: [{ tagId }, { legacyTagId: tagId }]
      },
      attributes: ['id'],
      transaction
    }),
    AuthorizedTag.findOne({ where: { tagId }, attributes: ['id'], transaction })
  ]);
  return Boolean(mobileUser || authorizedTag);
}

/**
 * Generate a collision-safe charger idTag.  This does not derive from a phone
 * number, so changing a user's phone never changes their charger credential.
 */
async function generateChargerTag({ transaction, maxAttempts = 20 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = `D${crypto.randomBytes(5).toString('hex').slice(0, 9).toUpperCase()}`;
    if (!(await tagExists(candidate, transaction))) return candidate;
  }
  throw new Error('Unable to allocate a unique charger idTag');
}

/**
 * Resolve an old MOB tag to the user's canonical vendor-compatible tag.  A
 * tag that is not linked to a mobile account is returned unchanged so legacy
 * test/system tags continue to work.
 */
async function resolveCanonicalChargerTag(tagId, options = {}) {
  const input = String(tagId || '').trim();
  if (!input) return input;
  if (isCanonicalChargerTag(input)) return normaliseTag(input);
  const user = await findMobileUserByTag(input, options);
  return user?.tagId || input;
}

module.exports = {
  CANONICAL_TAG_PATTERN,
  normaliseTag,
  isCanonicalChargerTag,
  tagAliases,
  mobileUserTagWhere,
  findMobileUserByTag,
  generateChargerTag,
  resolveCanonicalChargerTag
};
