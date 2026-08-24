const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('transactions');
    if (!columns.grossAmount) {
      await queryInterface.addColumn('transactions', 'grossAmount', {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Energy charge before applying a location minimum charge'
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('transactions');
    if (columns.grossAmount) {
      await queryInterface.removeColumn('transactions', 'grossAmount');
    }
  }
};
