require('dotenv').config();

const { sequelize, MobileUser, AuthorizedTag } = require('../src/models');
const migration = require('../migrations/add_charger_tag_alias');
const {
  isCanonicalChargerTag,
  generateChargerTag
} = require('../src/services/chargerTagService');

async function migrateUser(user) {
  const oldTag = user.tagId ? String(user.tagId).trim() : null;
  if (oldTag && isCanonicalChargerTag(oldTag)) {
    await AuthorizedTag.findOrCreate({
      where: { tagId: oldTag },
      defaults: { tagId: oldTag, status: 'Active', blocked: false }
    });
    return { changed: false, oldTag, newTag: oldTag };
  }

  // A partially completed run is safe to resume, but never overwrite an
  // already populated alias because it may be the only reference to history.
  if (user.legacyTagId && oldTag && user.legacyTagId !== oldTag) {
    return { changed: false, skipped: true, oldTag, reason: 'legacy alias already populated' };
  }

  const transaction = await sequelize.transaction();
  try {
    const newTag = await generateChargerTag({ transaction });
    const oldAuthorized = oldTag
      ? await AuthorizedTag.findOne({ where: { tagId: oldTag }, transaction })
      : null;

    await user.update({
      tagId: newTag,
      legacyTagId: oldTag || user.legacyTagId || null
    }, { transaction });

    await AuthorizedTag.findOrCreate({
      where: { tagId: newTag },
      defaults: {
        tagId: newTag,
        status: oldAuthorized?.status || 'Active',
        blocked: oldAuthorized?.blocked || false,
        expiryDate: oldAuthorized?.expiryDate || null,
        parentTagId: oldAuthorized?.parentTagId || null,
        validFrom: oldAuthorized?.validFrom || null,
        validTo: oldAuthorized?.validTo || null
      },
      transaction
    });

    // The old AuthorizedTag row and all transaction rows remain as-is. The
    // old tag is now an alias only, allowing historical reports and any old
    // charger still presenting it to resolve to this same account.
    await transaction.commit();
    return { changed: true, oldTag, newTag };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());

    const users = await MobileUser.findAll({
      attributes: ['id', 'tagId', 'legacyTagId'],
      order: [['id', 'ASC']]
    });
    let changed = 0;
    let skipped = 0;
    for (const user of users) {
      const result = await migrateUser(user);
      if (result.changed) changed += 1;
      if (result.skipped) skipped += 1;
      if (result.changed) {
        console.log(`Mobile user ${user.id}: ${result.oldTag || '(none)'} -> ${result.newTag}`);
      }
    }
    console.log(`Charger tag migration complete. ${changed} users converted; ${skipped} ambiguous users skipped safely. Historical transactions were not modified.`);
  } catch (error) {
    console.error('Charger tag migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
