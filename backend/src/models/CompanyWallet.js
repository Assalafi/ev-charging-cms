const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('CompanyWallet', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  balance: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'company_wallets',
  indexes: [{ unique: true, fields: ['companyId'] }]
});
