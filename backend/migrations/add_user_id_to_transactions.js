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

    // Backfill userId for existing transactions by matching idTag to mobile_user.tagId
    await queryInterface.sequelize.query(`
      UPDATE transactions t
      SET userId = mu.id
      FROM mobile_users mu
      WHERE t.idTag = mu.tagId
      AND t.userId IS NULL
    `);

    console.log('Migration completed: Added userId to transactions and backfilled existing records');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('transactions', ['userId']);
    await queryInterface.removeColumn('transactions', 'userId');
    console.log('Migration rolled back: Removed userId from transactions');
  }
};
