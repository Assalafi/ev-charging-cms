const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Friendly name for this location'
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Nigeria',
      comment: 'Country name'
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nigerian state'
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Street address or landmark'
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'GPS latitude for navigation'
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'GPS longitude for navigation'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    pricePerWh: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.4,
      comment: 'Price per Wh in Naira (e.g. 0.4 = ₦400/kWh)'
    },
    minimumCharge: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 150,
      comment: 'Minimum charge in Naira'
    },
    partnerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Reference to partner company (NULL = main company location)'
    },
    productionCostPerWh: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Production cost per Wh for this location'
    },
    partnerSharePercent: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Partner share percentage from profit (0-100)'
    },
    settlementEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether settlement is enabled for this location'
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'locations',
    timestamps: true
  });

  return Location;
};
