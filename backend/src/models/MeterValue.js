const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('meter_value', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chargePointId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    transactionId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false
    },
    value: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    unit: {
      type: DataTypes.STRING,
      defaultValue: 'Wh'
    },
    measurand: {
      type: DataTypes.STRING,
      defaultValue: 'Energy.Active.Import.Register'
    },
    phase: DataTypes.STRING,
    location: DataTypes.STRING,
    context: {
      type: DataTypes.STRING,
      defaultValue: 'Sample.Periodic'
    }
  }, {
    tableName: 'meter_values',
    timestamps: true,
    indexes: [
      { fields: ['chargePointId'] },
      { fields: ['connectorId'] },
      { fields: ['transactionId'] },
      { fields: ['timestamp'] },
      { fields: ['measurand'] }
    ]
  });
};
