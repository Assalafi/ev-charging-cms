/**
 * Migration: Add userId to transactions table
 * This migration adds a userId column to properly link transactions to mobile users
 */
const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('transactions', 'userId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'mobile_users',
        key: 'id'
      },
      comment: 'Mobile user ID who initiated this transaction',
      after: 'idTag'
    });

    await queryInterface.addIndex('transactions', ['userId']);

    // Backfill by either current or preserved legacy tag. This remains
    // compatible with databases that predate the charger-tag alias column.
    const [legacyColumn] = await queryInterface.sequelize.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mobile_users' AND column_name = 'legacy_tag_id'
      LIMIT 1
    `);
    const legacyMatch = legacyColumn.length ? 'OR t."idTag" = mu."legacy_tag_id"' : '';
    await queryInterface.sequelize.query(`
      UPDATE transactions t
      SET "userId" = mu.id
      FROM mobile_users mu
      WHERE (t."idTag" = mu."tagId" ${legacyMatch})
      AND t."userId" IS NULL
    `);

    console.log('Migration completed: Added userId to transactions and backfilled existing records');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('transactions', ['userId']);
    await queryInterface.removeColumn('transactions', 'userId');
    console.log('Migration rolled back: Removed userId from transactions');
  }
};
