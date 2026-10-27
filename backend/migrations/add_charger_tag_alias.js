const { DataTypes } = require('sequelize');

async function describe(queryInterface) {
  try {
    return await queryInterface.describeTable('mobile_users');
  } catch (error) {
    return null;
  }
}

module.exports = {
  async up(queryInterface) {
    const columns = await describe(queryInterface);
    if (!columns) throw new Error('mobile_users table does not exist');

    if (!columns.legacy_tag_id) {
      await queryInterface.addColumn('mobile_users', 'legacy_tag_id', {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Previous OCPP idTag retained for historical transactions and charger compatibility'
      });
    }

    // This is intentionally non-unique. Existing databases may contain legacy
    // data imported from another system; a failed uniqueness constraint must
    // never block the non-destructive migration.
    try {
      await queryInterface.addIndex('mobile_users', ['legacy_tag_id'], {
        name: 'mobile_users_legacy_tag_id_idx'
      });
    } catch (error) {
      if (!/already exists|duplicate/i.test(error.message || '')) throw error;
    }
  },

  // Removing an alias column would make historical tag references ambiguous;
  // keep rollback deliberately non-destructive.
  async down() {}
};
