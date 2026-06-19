const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('reservation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    reservationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
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
      allowNull: false
    },
    idTag: {
      type: DataTypes.STRING,
      allowNull: false
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('Accepted', 'Occupied', 'Faulted', 'Unavailable', 'Rejected'),
      defaultValue: 'Accepted'
    }
  }, {
    tableName: 'reservations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['reservationId'] },
      { fields: ['chargePointId', 'connectorId'] },
      { fields: ['idTag'] },
      { fields: ['expiryDate'] }
    ]
  });
};
