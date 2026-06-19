const express = require('express');
const {
    ChargingStation,
    Transaction
} = require('../models');
const {
    authenticate,
    authorize
} = require('../middleware/auth');
const ocppServer = require('../ocpp/server');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   POST /api/remote-commands/:stationId/reset
 * @desc    Send Reset command to charging station
 * @access  Private/Admin
 */
router.post('/:stationId/reset', authorize(['admin']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            type = 'Soft'
        } = req.body;

        // Validate reset type
        if (type !== 'Soft' && type !== 'Hard') {
            return res.status(400).json({
                success: false,
                message: 'Reset type must be either "Soft" or "Hard"'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send Reset command
        const result = await ocppServer.sendOcppRequest(stationId, 'Reset', {
            type
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send Reset command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `${type} reset command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending Reset command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/change-configuration
 * @desc    Send ChangeConfiguration command to charging station
 * @access  Private/Admin
 */
router.post('/:stationId/change-configuration', authorize(['admin']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            key,
            value
        } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Key and value are required'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send ChangeConfiguration command
        const result = await ocppServer.sendOcppRequest(stationId, 'ChangeConfiguration', {
            key,
            value: value.toString() // OCPP requires values to be strings
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send ChangeConfiguration command'
            });
        }

        // Store configuration change in database
        const configuration = station.configuration || {};
        configuration[key] = value;
        await station.update({
            configuration
        });

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Configuration change sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending ChangeConfiguration command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/get-configuration
 * @desc    Send GetConfiguration command to charging station
 * @access  Private/Admin
 */
router.post('/:stationId/get-configuration', authorize(['admin']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            keys
        } = req.body; // Optional specific keys to retrieve

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send GetConfiguration command
        const payload = {};
        if (keys && Array.isArray(keys) && keys.length > 0) {
            payload.key = keys;
        }

        const result = await ocppServer.sendOcppRequest(stationId, 'GetConfiguration', payload);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send GetConfiguration command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `GetConfiguration command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending GetConfiguration command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/unlock-connector
 * @desc    Send UnlockConnector command to charging station
 * @access  Private/Operator
 */
router.post('/:stationId/unlock-connector', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            connectorId = 1
        } = req.body;

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send UnlockConnector command
        const result = await ocppServer.sendOcppRequest(stationId, 'UnlockConnector', {
            connectorId: parseInt(connectorId)
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send UnlockConnector command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Unlock connector command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending UnlockConnector command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/trigger-message
 * @desc    Send TriggerMessage command to request specific data from charging station
 * @access  Private/Admin
 */
router.post('/:stationId/trigger-message', authorize(['admin']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            requestedMessage,
            connectorId
        } = req.body;

        if (!requestedMessage) {
            return res.status(400).json({
                success: false,
                message: 'requestedMessage is required'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Prepare payload
        const payload = {
            requestedMessage
        };

        if (connectorId !== undefined) {
            payload.connectorId = parseInt(connectorId);
        }

        // Send TriggerMessage command
        const result = await ocppServer.sendOcppRequest(stationId, 'TriggerMessage', payload);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send TriggerMessage command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Trigger message command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending TriggerMessage command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/remote-start
 * @desc    Send RemoteStartTransaction command to charging station
 * @access  Private/Operator
 */
router.post('/:stationId/remote-start', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            idTag,
            connectorId = 1
        } = req.body;

        if (!idTag) {
            return res.status(400).json({
                success: false,
                message: 'idTag is required'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send RemoteStartTransaction command
        const result = await ocppServer.sendOcppRequest(stationId, 'RemoteStartTransaction', {
            connectorId: parseInt(connectorId),
            idTag
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send RemoteStartTransaction command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Remote start transaction command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending RemoteStartTransaction command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/remote-stop
 * @desc    Send RemoteStopTransaction command to charging station
 * @access  Private/Operator
 */
router.post('/:stationId/remote-stop', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        let {
            transactionId
        } = req.body;
        
        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }
        
        // If no transaction ID was provided, use the current transaction from the station record
        if (!transactionId && station.currentTransaction) {
            transactionId = station.currentTransaction;
            logger.info(`Using current transaction ID ${transactionId} from station record for ${stationId}`);
        }
        
        // If we still don't have a transaction ID, try to find the latest active transaction
        if (!transactionId) {
            const activeTransaction = await Transaction.findOne({
                where: {
                    chargePointId: stationId,
                    status: 'InProgress'
                },
                order: [['startTime', 'DESC']]
            });
            
            if (activeTransaction) {
                transactionId = activeTransaction.transactionId;
                logger.info(`Using latest active transaction ID ${transactionId} for ${stationId}`);
            }
        }
        
        // If we still don't have a transaction ID, return an error
        if (!transactionId) {
            return res.status(400).json({
                success: false,
                message: 'No active transaction found for this charging station'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Send RemoteStopTransaction command
        const result = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', {
            transactionId: parseInt(transactionId)
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send RemoteStopTransaction command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Remote stop transaction command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending RemoteStopTransaction command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/remote-commands/:stationId/data-transfer
 * @desc    Send DataTransfer command to charging station
 * @access  Private/Admin
 */
router.post('/:stationId/data-transfer', authorize(['admin']), async (req, res) => {
    try {
        const {
            stationId
        } = req.params;
        const {
            vendorId,
            messageId,
            data
        } = req.body;

        if (!vendorId) {
            return res.status(400).json({
                success: false,
                message: 'vendorId is required'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        if (!ocppServer.isConnected(stationId)) {
            return res.status(400).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // Prepare payload
        const payload = {
            vendorId,
            data
        };

        if (messageId) {
            payload.messageId = messageId;
        }

        // Send DataTransfer command
        const result = await ocppServer.sendOcppRequest(stationId, 'DataTransfer', payload);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send DataTransfer command'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `Data transfer command sent successfully`
        });
    } catch (error) {
        logger.error(`Error sending DataTransfer command:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
