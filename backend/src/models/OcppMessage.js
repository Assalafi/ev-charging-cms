const {
    DataTypes,
    Op
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
            comment: 'Immutable station identifier snapshot retained for protocol history'
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
        },
        processedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'When an inbound request finished processing'
        },
        processingError: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Processing error retained for retry diagnostics'
        },
        responsePayload: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Cached OCPP response for idempotent request replay'
        },
        dedupeKey: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Inbound request idempotency key; existing history remains nullable'
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
            },
            {
                name: 'ocpp_messages_dedupe_key_unique',
                unique: true,
                fields: ['dedupeKey'],
                where: {
                    dedupeKey: {
                        [Op.ne]: null
                    }
                }
            }
        ]
    });
};
