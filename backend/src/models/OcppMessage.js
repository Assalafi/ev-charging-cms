const {
    DataTypes
} = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('ocpp_message', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        messageId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        chargePointId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'charging_stations',
                key: 'chargePointId'
            }
        },
        message_type: {
            type: DataTypes.ENUM(
                'Authorize', 'BootNotification', 'DataTransfer', 'Heartbeat',
                'MeterValues', 'StartTransaction', 'StatusNotification', 'StopTransaction',
                'ClearChargingProfile', 'GetCompositeSchedule', 'SetChargingProfile',
                'TriggerMessage', 'GetDiagnostics', 'DiagnosticsStatusNotification',
                'FirmwareStatusNotification', 'UpdateFirmware', 'GetLocalListVersion',
                'SendLocalList', 'CancelReservation', 'ReserveNow', 'ChangeAvailability',
                'ChangeConfiguration', 'ClearCache', 'GetConfiguration', 'Reset',
                'UnlockConnector', 'Error', 'InternalError', 'Response'
            ),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('Sent', 'Received', 'Failed', 'Pending', 'Timeout'),
            defaultValue: 'Pending'
        },
        errorCode: {
            type: DataTypes.STRING
        },
        errorDescription: {
            type: DataTypes.STRING
        },
        timestamp: {
            type: DataTypes.DATE
        },
        payload: {
            type: DataTypes.JSONB
        },
        direction: {
            type: DataTypes.ENUM('Inbound', 'Outbound'),
            allowNull: false
        }
    }, {
        tableName: 'ocpp_messages',
        timestamps: true,
        indexes: [{
                fields: ['chargingStationId']
            },
            {
                fields: ['message_type']
            },
            {
                fields: ['status']
            },
            {
                fields: ['messageId']
            },
            {
                fields: ['createdAt']
            }
        ]
    });
};