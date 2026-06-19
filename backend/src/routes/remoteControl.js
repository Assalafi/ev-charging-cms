const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ocppServer = require('../ocpp/server');
const logger = require('../utils/logger');
const { Transaction } = require('../models');
const eventEmitter = require('../utils/eventEmitter');

const router = express.Router();

/**
 * @route   POST /api/remote/start
 * @desc    Send RemoteStartTransaction command to charging station
 * @access  Private
 */
router.post('/start', authenticate, async (req, res) => {
  try {
    const { chargePointId, connectorId, idTag } = req.body;
    
    if (!chargePointId || !idTag) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID and idTag are required'
      });
    }
    
    // Check if station is connected
    if (!ocppServer.isConnected(chargePointId)) {
      return res.status(400).json({
        success: false,
        message: 'Charging station is not connected'
      });
    }
    
    // Prepare payload
    const payload = {
      idTag: idTag,
      connectorId: parseInt(connectorId || 1, 10)
    };
    
    // Send RemoteStartTransaction command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStartTransaction', payload);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to start transaction'
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: 'RemoteStartTransaction command sent successfully'
    });
  } catch (error) {
    logger.error('Error sending RemoteStartTransaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/remote/stop
 * @desc    Send RemoteStopTransaction command to charging station
 * @access  Private
 */
router.post('/stop', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    // Find the active transaction
    const transaction = await Transaction.findOne({
      where: {
        transactionId: transactionId,
        status: 'InProgress'
      }
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or already completed'
      });
    }
    
    const chargePointId = transaction.chargePointId;
    
    // Check if station is connected
    if (!ocppServer.isConnected(chargePointId)) {
      return res.status(400).json({
        success: false,
        message: 'Charging station is not connected'
      });
    }
    
    // First update the transaction status to 'Stopping'
    await transaction.update({ status: 'Stopping' });
    
    // Publish status update to MQTT for UI transition
    const mqttClient = require('../ocpp/mqtt').client;
    if (mqttClient) {
      mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
        connectorId: transaction.connectorId,
        status: 'Stopping',
        transactionId: transactionId,
        timestamp: new Date().toISOString()
      }));
      
      mqttClient.publish(`ocpp/transactions/${transactionId}/status`, JSON.stringify({
        status: 'Stopping',
        timestamp: new Date().toISOString()
      }));
    }
    
    // Create a promise that resolves when StopTransaction is received
    const stopPromise = new Promise((resolve, reject) => {
      // Set a timeout for the operation
      const timeout = setTimeout(() => {
        eventEmitter.removeListener('stop-transaction', handleStopTransaction);
        reject(new Error('Stop confirmation timeout after 30 seconds'));
      }, 30000); // 30 second timeout as recommended
      
      // Define handler for stop transaction event
      const handleStopTransaction = (stopData) => {
        if (stopData.transactionId == transactionId) {
          clearTimeout(timeout);
          resolve(stopData);
          eventEmitter.removeListener('stop-transaction', handleStopTransaction);
        }
      };
      
      // Listen for the stop transaction event
      eventEmitter.on('stop-transaction', handleStopTransaction);
    });
    
    // Send RemoteStopTransaction command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
      transactionId: parseInt(transactionId, 10)
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to send stop command'
      });
    }
    
    // Return initial success response to client to avoid timeout
    res.json({
      success: true,
      messageId: result.messageId,
      message: 'RemoteStopTransaction command sent successfully, waiting for confirmation',
      status: 'Stopping'
    });
    
    // Wait for stop transaction or timeout (in background)
    stopPromise.then(stopData => {
      logger.info(`Transaction ${transactionId} successfully stopped with meterStop=${stopData.meterStop}`);
    }).catch(error => {
      logger.error(`Error stopping transaction ${transactionId}: ${error.message}`);
      // If timeout occurred, reset the status back to Charging to prevent UI being stuck
      Transaction.findOne({ where: { transactionId, status: 'Stopping' } })
        .then(tx => {
          if (tx) {
            tx.update({ status: 'InProgress' });
            // Notify UI of the failure
            if (mqttClient) {
              mqttClient.publish(`ocpp/transactions/${transactionId}/status`, JSON.stringify({
                status: 'InProgress',
                error: 'Stop timeout',
                timestamp: new Date().toISOString()
              }));
            }
          }
        });
    });
    
  } catch (error) {
    logger.error('Error sending RemoteStopTransaction:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
