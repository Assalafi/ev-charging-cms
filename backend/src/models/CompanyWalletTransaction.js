const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('CompanyWalletTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  walletId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  beneficiaryUserId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  fundingRuleId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('CREDIT', 'DEBIT'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN'
  },
  reference: {
    type: DataTypes.STRING(180),
    allowNull: false,
    unique: true
  },
  method: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'internal'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REVERSED'),
    allowNull: false,
    defaultValue: 'SUCCESS'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  performedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'company_wallet_transactions',
  indexes: [
    { fields: ['companyId', 'createdAt'] },
    { fields: ['beneficiaryUserId'] },
    { fields: ['status'] },
    { unique: true, fields: ['reference'] }
  ]
});
