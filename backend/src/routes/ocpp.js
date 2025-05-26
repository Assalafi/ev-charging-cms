const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ocppServer = require('../ocpp/server');
const logger = require('../utils/logger');
const { ChargingStation } = require('../models');

const router = express.Router();

/**
 * @route   GET /api/ocpp/status
 * @desc    Get OCPP server status and connected stations
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    // Check if the OCPP server is initialized
    const initialized = ocppServer._isInitialized ? ocppServer._isInitialized() : false;
    
    // Get connected stations
    const connectedStations = ocppServer.getConnectedStations ? ocppServer.getConnectedStations() : [];
    
    // Get connections map for diagnostics
    const connectionsMap = ocppServer._getConnectionsForDiagnostics ? 
      ocppServer._getConnectionsForDiagnostics() : null;
    
    // Get total connection count (including inactive ones)
    const totalStations = await ChargingStation.count();
    
    res.json({
      success: true,
      initialized,
      connectionCount: connectionsMap ? connectionsMap.size : 0,
      connectedStations,
      totalStations,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting OCPP status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/ocpp/command
 * @desc    Send generic OCPP command to charging station
 * @access  Private/Admin
 */
router.post('/command', authorize('admin'), async (req, res) => {
  try {
    const { chargePointId, command, payload } = req.body;
    
    if (!chargePointId || !command) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID and command are required'
      });
    }
    
    // Send command to station
    const result = await ocppServer.sendOcppRequest(chargePointId, command, payload || {});
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || `Failed to send ${command} command`
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: `${command} command sent to ${chargePointId}`
    });
  } catch (error) {
    logger.error('Error sending OCPP command:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/ocpp/get-configuration
 * @desc    Send GetConfiguration command
 * @access  Private/Operator
 */
router.post('/get-configuration', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const { chargePointId, keys } = req.body;
    
    if (!chargePointId) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID is required'
      });
    }
    
    // Send GetConfiguration command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'GetConfiguration', {
      key: keys || []
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to get configuration'
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: 'GetConfiguration command sent'
    });
  } catch (error) {
    logger.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/ocpp/change-configuration
 * @desc    Send ChangeConfiguration command
 * @access  Private/Admin
 */
router.post('/change-configuration', authorize('admin'), async (req, res) => {
  try {
    const { chargePointId, key, value } = req.body;
    
    if (!chargePointId || !key || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID, key, and value are required'
      });
    }
    
    // Send ChangeConfiguration command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'ChangeConfiguration', {
      key,
      value: String(value)
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to change configuration'
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: `Configuration change for ${key} sent`
    });
  } catch (error) {
    logger.error('Error changing configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/ocpp/update-firmware
 * @desc    Send UpdateFirmware command
 * @access  Private/Admin
 */
router.post('/update-firmware', authorize('admin'), async (req, res) => {
  try {
    const { chargePointId, location, retrieveDate } = req.body;
    
    if (!chargePointId || !location || !retrieveDate) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID, location, and retrieveDate are required'
      });
    }
    
    // Send UpdateFirmware command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'UpdateFirmware', {
      location,
      retrieveDate: new Date(retrieveDate).toISOString(),
      retries: req.body.retries || 0,
      retryInterval: req.body.retryInterval || 0
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to update firmware'
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: 'Update firmware command sent'
    });
  } catch (error) {
    logger.error('Error updating firmware:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/ocpp/get-diagnostics
 * @desc    Send GetDiagnostics command
 * @access  Private/Admin
 */
router.post('/get-diagnostics', authorize('admin'), async (req, res) => {
  try {
    const { chargePointId, location } = req.body;
    
    if (!chargePointId || !location) {
      return res.status(400).json({
        success: false,
        message: 'Charge point ID and location are required'
      });
    }
    
    // Send GetDiagnostics command
    const result = await ocppServer.sendOcppRequest(chargePointId, 'GetDiagnostics', {
      location,
      startTime: req.body.startTime ? new Date(req.body.startTime).toISOString() : undefined,
      stopTime: req.body.stopTime ? new Date(req.body.stopTime).toISOString() : undefined,
      retries: req.body.retries || 0,
      retryInterval: req.body.retryInterval || 0
    });
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to get diagnostics'
      });
    }
    
    res.json({
      success: true,
      messageId: result.messageId,
      message: 'Get diagnostics command sent'
    });
  } catch (error) {
    logger.error('Error getting diagnostics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

/**
 * @route   GET /api/ocpp/connected
 * @desc    Get all connected charging stations
 * @access  Private
 */
router.get('/connected', authenticate, async (req, res) => {
  try {
    const connectedStations = ocppServer.getConnectedStations();
    
    res.json({
      success: true,
      count: connectedStations.length,
      stations: connectedStations
    });
  } catch (error) {
    logger.error('Error getting connected stations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
