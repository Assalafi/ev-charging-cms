const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('connector', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chargePointId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'charging_stations',
        key: 'chargePointId'
      }
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    status: {
      type: DataTypes.ENUM(
        'Available',    // Not charging, ready to use
        'Preparing',    // Reserved or about to charge
        'Charging',     // Currently charging
        'SuspendedEVSE', // Temporarily suspended by station
        'SuspendedEV',   // Temporarily suspended by vehicle
        'Finishing',    // Completing charging session
        'Reserved',     // Reserved for future use
        'Unavailable',  // Connector not available for use
        'Faulted'       // Error condition
      ),
      defaultValue: 'Available'
    },
    errorCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    info: {
      type: DataTypes.STRING,
      allowNull: true
    },
    vendorId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    vendorErrorCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    transactionId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    meterValue: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    soc: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'State of Charge (battery percentage) from EV'
    },
    lastStatusUpdate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'connectors',
    timestamps: true,
    indexes: [
      { fields: ['chargePointId'] },
      { fields: ['status'] },
      { unique: true, fields: ['chargePointId', 'connectorId'] }
    ]
  });
};
