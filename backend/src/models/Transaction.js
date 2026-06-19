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
        reason: DataTypes.STRING,
        status: {
            type: DataTypes.ENUM('InProgress', 'Completed', 'Stopped'),
            defaultValue: 'InProgress'
        },
        billedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Timestamp when wallet was debited. NULL means not yet billed.'
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