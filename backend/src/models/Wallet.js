const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Wallet = sequelize.define('Wallet', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: 'Reference to mobile user'
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: 'Current wallet balance'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      comment: 'Currency code'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'wallets',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId']
      }
    ]
  });

  return Wallet;
};
