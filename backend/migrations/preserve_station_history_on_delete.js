module.exports = {
  async up(queryInterface) {
    // Transactions and OCPP messages are audit records. Their chargePointId is
    // intentionally retained as a historical snapshot after a station is removed.
    await queryInterface.sequelize.query(`
      ALTER TABLE transactions
      DROP CONSTRAINT IF EXISTS "transactions_chargePointId_fkey"
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE ocpp_messages
      DROP CONSTRAINT IF EXISTS "ocpp_messages_chargePointId_fkey"
    `);
  },

  async down(queryInterface) {
    // Reinstating either constraint can fail when history references a removed
    // station, so rollback is intentionally non-destructive.
    await queryInterface.sequelize.query('SELECT 1');
  }
};
