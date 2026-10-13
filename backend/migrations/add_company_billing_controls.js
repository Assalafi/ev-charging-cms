const { DataTypes } = require('sequelize');

async function describe(queryInterface) {
  try {
    return await queryInterface.describeTable('subscription_companies');
  } catch (error) {
    return null;
  }
}

module.exports = {
  async up(queryInterface) {
    const columns = await describe(queryInterface);
    if (!columns) throw new Error('subscription_companies table does not exist; run the company subscriptions migration first');

    if (!columns.debtEnabled) {
      await queryInterface.addColumn('subscription_companies', 'debtEnabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Allows company-funded user transfers to take the company wallet below zero'
      });
    }
    if (!columns.pricePerWh) {
      await queryInterface.addColumn('subscription_companies', 'pricePerWh', {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Company charging price per Wh. NULL keeps the location tariff for legacy companies.'
      });
    }
    if (!columns.minimumCharge) {
      await queryInterface.addColumn('subscription_companies', 'minimumCharge', {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Company minimum charging amount. NULL keeps the location minimum for legacy companies.'
      });
    }
  },

  // Keep rollback non-destructive: these columns carry company billing policy
  // and removing them could silently change historical pricing/debt records.
  async down() {}
};
