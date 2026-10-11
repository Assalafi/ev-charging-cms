const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('CompanyFundingRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mobileUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'NULL applies to all active users in the company'
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'yearly'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  nextRunAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lastRunAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  notes: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'company_funding_rules',
  indexes: [
    { fields: ['companyId', 'active'] },
    { fields: ['nextRunAt'] },
    { fields: ['mobileUserId'] }
  ]
});
