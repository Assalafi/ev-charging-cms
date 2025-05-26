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

module.exports = router;
