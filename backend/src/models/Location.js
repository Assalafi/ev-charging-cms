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
