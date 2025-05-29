const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('charging_station', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chargePointId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    model: DataTypes.STRING,
    vendor: DataTypes.STRING,
    serialNumber: DataTypes.STRING,
    firmwareVersion: DataTypes.STRING,
    iccid: DataTypes.STRING,
    imsi: DataTypes.STRING,
    meterType: DataTypes.STRING,
    meterSerialNumber: DataTypes.STRING,
    status: {
      type: DataTypes.STRING,
      defaultValue: 'Unavailable'
    },
    errorCode: DataTypes.STRING,
    lastHeartbeat: DataTypes.DATE,
    lastConnection: DataTypes.DATE,
    ipAddress: DataTypes.STRING,
    currentMeterValue: DataTypes.FLOAT,
    currentTransaction: DataTypes.INTEGER,
    connectorCount: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    connectorStatus: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    configuration: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'charging_stations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['chargePointId'] }
    ]
  });

  // Define associations
  ChargingStation.associate = (models) => {
    ChargingStation.hasMany(models.Transaction, {
      foreignKey: 'chargePointId',
      sourceKey: 'chargePointId',
      as: 'transactions'
    });
  };

  return ChargingStation;
};
