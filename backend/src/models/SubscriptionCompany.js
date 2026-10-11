const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('SubscriptionCompany', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(160),
    allowNull: true,
    validate: { isEmail: true }
  },
  phone: {
    type: DataTypes.STRING(60),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  country: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Nigeria'
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'inactive'),
    allowNull: false,
    defaultValue: 'active'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'subscription_companies',
  indexes: [
    { fields: ['status'] },
    { fields: ['state'] },
    { fields: ['name'] }
  ]
});
