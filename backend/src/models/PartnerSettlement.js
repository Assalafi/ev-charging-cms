const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PartnerSettlement = sequelize.define('PartnerSettlement', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    partnerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to partner company'
    },
    periodType: {
      type: DataTypes.ENUM('weekly', 'monthly', 'yearly', 'custom'),
      allowNull: false,
      comment: 'Settlement period type'
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Period start date'
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Period end date'
    },
    totalTransactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of transactions in settlement'
    },
    totalEnergyWh: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Total energy in Wh'
    },
    grossAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Total gross revenue'
    },
    productionCostAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Total production cost'
    },
    profitAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Total profit (gross - production cost)'
    },
    partnerEarning: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Partner share of profit'
    },
    companyEarning: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Company share of profit'
    },
    adjustmentAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Manual adjustment amount'
    },
    finalPayableAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Final amount to pay to partner'
    },
    status: {
      type: DataTypes.ENUM('draft', 'approved', 'paid', 'cancelled'),
      defaultValue: 'draft',
      comment: 'Settlement status'
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin user ID who approved'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Approval timestamp'
    },
    paidBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin user ID who marked as paid'
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Payment timestamp'
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Payment reference number'
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Payment method (bank_transfer, etc)'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes'
    }
  }, {
    tableName: 'partner_settlements',
    timestamps: true,
    indexes: [
      {
        fields: ['partnerId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['periodType']
      },
      {
        fields: ['periodStart']
      },
      {
        fields: ['periodEnd']
      },
      {
        unique: true,
        fields: ['partnerId', 'periodStart', 'periodEnd'],
        name: 'unique_partner_period'
      }
    ]
  });

  return PartnerSettlement;
};
