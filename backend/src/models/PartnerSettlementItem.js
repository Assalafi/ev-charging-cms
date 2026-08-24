const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PartnerSettlementItem = sequelize.define('PartnerSettlementItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    settlementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to settlement'
    },
    transactionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to charging transaction'
    },
    chargePointId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Charging station ID'
    },
    locationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Location ID'
    },
    energyWh: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Energy delivered in Wh'
    },
    grossAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Gross revenue from transaction'
    },
    productionCostAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Production cost for transaction'
    },
    profitAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Profit (gross - production cost)'
    },
    partnerEarning: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Partner earning from transaction'
    },
    companyEarning: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Company earning from transaction'
    }
  }, {
    tableName: 'partner_settlement_items',
    timestamps: true,
    indexes: [
      {
        fields: ['settlementId']
      },
      {
        fields: ['transactionId']
      },
      {
        fields: ['locationId']
      },
      {
        unique: true,
        fields: ['settlementId', 'transactionId'],
        name: 'unique_settlement_transaction'
      }
    ]
  });

  return PartnerSettlementItem;
};
