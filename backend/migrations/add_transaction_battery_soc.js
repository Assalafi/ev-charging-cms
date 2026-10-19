const { DataTypes } = require('sequelize');

/**
 * Keep vehicle state-of-charge history on each transaction. Both columns are
 * nullable because OCPP 1.6 charge points are not required to report SoC.
 * Existing transactions are preserved and remain null when no real reading
 * was received.
 */
module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('transactions');
    const fields = {
      startBatteryPercentage: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'First vehicle state-of-charge percentage reported during this session'
      },
      endBatteryPercentage: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Latest vehicle state-of-charge percentage reported for this session'
      }
    };

    for (const [name, definition] of Object.entries(fields)) {
      if (!columns[name]) await queryInterface.addColumn('transactions', name, definition);
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('transactions');
    for (const name of ['endBatteryPercentage', 'startBatteryPercentage']) {
      if (columns[name]) await queryInterface.removeColumn('transactions', name);
    }
  }
};
