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
            comment: 'Immutable station identifier snapshot retained for historical sessions'
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
        startBatteryPercentage: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'First vehicle state-of-charge percentage reported during this session'
        },
        endBatteryPercentage: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'Latest vehicle state-of-charge percentage reported for this session'
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
        billingAttempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Number of billing attempts made for this transaction'
        },
        billingLastError: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Last billing failure; retained for retry diagnostics'
        },
        billingNextAttemptAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Earliest time at which a failed billing attempt may be retried'
        },
        offlineSince: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'When the station connection was lost while this transaction was active'
        },
        ocppTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Transaction ID understood by the charge point; may differ from the internal recovery ID'
        },
        ocppStartMessageId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Inbound StartTransaction request ID that proves connector and tag ownership'
        },
        remoteStartMessageId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Accepted RemoteStartTransaction request used as recovery ownership evidence'
        },
        ownershipSource: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Audit source used to establish the immutable session owner'
        },
        ownershipVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lastMeterValueWh: {
            type: DataTypes.DOUBLE,
            allowNull: true,
            comment: 'Highest accepted cumulative energy register for monotonic session accounting'
        },
        lastMeterTimestamp: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Device timestamp of the latest accepted cumulative meter sample'
        },
        lastMeterReceivedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Server receipt time of the latest accepted cumulative meter sample'
        },
        ocppStopMessageId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'StopTransaction request that finalized this session'
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
        minimumChargeAmount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: 'Snapshot of the minimum charge used for this session'
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
            },
            {
                fields: ['chargePointId', 'connectorId', 'status']
            },
            {
                name: 'transactions_one_active_connector_idx',
                unique: true,
                fields: ['chargePointId', 'connectorId'],
                where: { status: 'InProgress' }
            },
            {
                fields: ['chargePointId', 'ocppTransactionId', 'status']
            },
            {
                fields: ['chargePointId', 'ocppStartMessageId']
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
