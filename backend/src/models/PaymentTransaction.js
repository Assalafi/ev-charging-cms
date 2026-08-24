const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentTransaction = sequelize.define('PaymentTransaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to mobile user'
    },
    walletId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to wallet'
    },
    type: {
      type: DataTypes.ENUM('CREDIT', 'DEBIT'),
      allowNull: false,
      comment: 'Transaction type'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Transaction amount'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      comment: 'Currency code'
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: 'Paystack transaction reference'
    },
    gateway: {
      type: DataTypes.STRING,
      defaultValue: 'paystack',
      comment: 'Payment gateway used'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REVERSED'),
      defaultValue: 'PENDING',
      comment: 'Transaction status'
    },
    gatewayResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Gateway response data'
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Transaction description'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional transaction metadata'
    }
  }, {
    tableName: 'payment_transactions',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['walletId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['reference']
      }
    ]
  });

  return PaymentTransaction;
};
