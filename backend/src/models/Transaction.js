const {
    DataTypes
} = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('transaction', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        chargePointId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'charging_stations',
                key: 'chargePointId'
            }
        },
        connectorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        idTag: {
            type: DataTypes.STRING,
            allowNull: false
        },
        startTime: {
            type: DataTypes.DATE,
            allowNull: false
        },
        stopTime: DataTypes.DATE,
        startMeterValue: {
            type: DataTypes.FLOAT,
            defaultValue: 0
        },
        stopMeterValue: DataTypes.FLOAT,
        energyDelivered: {
            type: DataTypes.FLOAT,
            defaultValue: 0
        },
        amount: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Calculated price for the transaction at the time of completion'
        },
        grossAmount: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Energy charge before applying the minimum charge'
        },
        reason: DataTypes.STRING,
        stopReason: {
            type: DataTypes.STRING,
            allowNull: true
        },
        autoStopType: {
            type: DataTypes.ENUM('percentage', 'amount'),
            allowNull: true
        },
        autoStopValue: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('InProgress', 'Completed', 'Stopped'),
            defaultValue: 'InProgress'
        },
        billedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Timestamp when wallet was debited. NULL means not yet billed.'
        },
        sellingPricePerWh: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'Snapshot of selling price per Wh at transaction time'
        },
        productionCostPerWh: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'Snapshot of production cost per Wh at transaction time'
        },
        partnerSharePercent: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'Snapshot of partner share percentage at transaction time'
        },
        minimumChargeApplied: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Whether minimum charge was applied'
        },
        productionCostAmount: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Production cost amount (energyWh * productionCostPerWh)'
        },
        profitAmount: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Profit after production cost (billableAmount - productionCostAmount)'
        },
        partnerEarning: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Partner share of profit'
        },
        companyEarning: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
            comment: 'Company share of profit'
        },
        partnerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Partner company ID at transaction time'
        },
        locationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Location ID at transaction time'
        },
        settlementId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Settlement ID this transaction is included in'
        },
        settlementStatus: {
            type: DataTypes.STRING(20),
            defaultValue: 'pending',
            comment: 'Settlement status for this transaction'
        }
    }, {
        tableName: 'transactions',
        timestamps: true,
        indexes: [{
                unique: true,
                fields: ['transactionId']
            },
            {
                fields: ['chargePointId']
            },
            {
                fields: ['idTag']
            },
            {
                fields: ['startTime']
            },
            {
                fields: ['partnerId']
            },
            {
                fields: ['settlementId']
            },
            {
                fields: ['settlementStatus']
            }
        ]
    });

    // Define associations
    Transaction.associate = (models) => {
        Transaction.belongsTo(models.ChargingStation, {
            foreignKey: 'chargePointId',
            targetKey: 'chargePointId',
            as: 'charging_station'
        });
    };

    return Transaction;
};
