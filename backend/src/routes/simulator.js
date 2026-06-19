/**
 * Simulator Routes for Testing OCPP Functionality
 * These routes allow simulating OCPP messages directly via HTTP for testing
 */

const express = require('express');
const router = express.Router();
const logger = require('../logger');

// Skip auth middleware for now to make testing easier
// We'll add a simple middleware function that allows all requests through
const authMiddleware = (req, res, next) => {
  next();
};

// Get the ChargingSessionTracker singleton
const ChargingSessionTracker = require('../services/chargingSessionTracker');
const chargingSessionTracker = ChargingSessionTracker.getInstance();

// Get MQTT client
const { client: mqttClient } = require('../ocpp/mqtt');

// Get DB models
const { Transaction } = require('../models');

/**
 * Simulate a MeterValues message for a specific station
 * This will update the charging session tracker and publish to MQTT
 */
router.post('/metervalues/:stationId', authMiddleware, async (req, res) => {
  try {
    const { stationId } = req.params;
    const { transactionId, meterValue, energyValue } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'transactionId is required' });
    }
    
    logger.info(`[SIMULATOR] Processing simulated MeterValues for station ${stationId}, transaction ${transactionId}`);
    
    // Find active transaction
    const transaction = await Transaction.findOne({
      where: {
        transactionId,
        chargePointId: stationId,
        status: 'InProgress'
      }
    });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: `No active transaction found with ID ${transactionId} for station ${stationId}` 
      });
    }
    
    // Calculate start time for duration
    const startTime = new Date(transaction.startTime);
    const duration = Math.floor((new Date() - startTime) / 1000); // seconds
    
    let updatedEnergy = energyValue;
    
    // If no direct energyValue provided, get from meter values
    if (updatedEnergy === undefined && meterValue) {
      // Process through charging session tracker
      if (chargingSessionTracker) {
        // For first update, make sure to initialize the session
        const existingSession = chargingSessionTracker.getSessionStats(transactionId);
        
        if (!existingSession) {
          chargingSessionTracker.startSession(transactionId, meterValue, transaction.startMeterValue);
          logger.info(`[SIMULATOR] Initialized session for transaction ${transactionId}`);
        }
        
        // Update with the meter value
        const result = chargingSessionTracker.updateMeterValue(transactionId, meterValue);
        logger.info(`[SIMULATOR] Updated session with meter values: ${JSON.stringify(result)}`);
        
        // Get updated stats
        const sessionStats = chargingSessionTracker.getSessionStats(transactionId);
        
        if (sessionStats) {
          updatedEnergy = sessionStats.totalEnergy / 1000; // Convert Wh to kWh
          logger.info(`[SIMULATOR] Session stats: ${JSON.stringify(sessionStats)}`);
        }
      }
    }
    
    // Default energy change if nothing else is available
    if (updatedEnergy === undefined) {
      // Calculate an increment based on the current value
      const currentEnergy = parseFloat(transaction.energyDelivered) || 0;
      updatedEnergy = currentEnergy + 0.5; // 0.5 kWh increment
    }
    
    // Update the transaction
    await transaction.update({
      energyDelivered: updatedEnergy
    });
    
    logger.info(`[SIMULATOR] Updated transaction ${transactionId} with energy: ${updatedEnergy} kWh`);
    
    // Directly publish to MQTT
    if (mqttClient) {
      const updateMessage = {
        timestamp: new Date().toISOString(),
        transactionId,
        chargePointId: stationId,
        energy: updatedEnergy,
        power: 11 + Math.random() * 5, // Simulated power between 11-16 kW
        batteryPercentage: Math.min(100, 20 + (updatedEnergy * 3)), // Simulated battery % based on energy
        duration
      };
      
      logger.info(`[SIMULATOR] Publishing energy update to MQTT: ${JSON.stringify(updateMessage)}`);
      
      // Publish to transaction and station-specific topics
      mqttClient.publish(`ocpp/transactions/${transactionId}/energy`, JSON.stringify(updateMessage));
      mqttClient.publish(`ocpp/stations/${stationId}/energy`, JSON.stringify(updateMessage));
    }
    
    res.json({
      success: true,
      message: `Successfully simulated MeterValues for station ${stationId}, transaction ${transactionId}`,
      updatedEnergy,
      transactionId
    });
    
  } catch (error) {
    logger.error(`[SIMULATOR] Error processing simulated MeterValues: ${error.message}`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Simulate a simple energy consumption increment for testing
 * This is the simplest way to test the energy display
 */
router.post('/increment-energy/:stationId/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { stationId, transactionId } = req.params;
    const { increment = 0.5 } = req.body; // Default 0.5 kWh increment
    
    logger.info(`[SIMULATOR] Incrementing energy for station ${stationId}, transaction ${transactionId} by ${increment} kWh`);
    
    // Find the transaction
    const transaction = await Transaction.findOne({
      where: {
        transactionId,
        chargePointId: stationId,
        status: 'InProgress'
      }
    });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: `No active transaction found with ID ${transactionId} for station ${stationId}` 
      });
    }
    
    // Calculate the new energy value
    const currentEnergy = parseFloat(transaction.energyDelivered) || 0;
    const newEnergy = currentEnergy + parseFloat(increment);
    
    // Update the transaction
    await transaction.update({
      energyDelivered: newEnergy
    });
    
    logger.info(`[SIMULATOR] Updated transaction ${transactionId} with energy: ${newEnergy} kWh`);
    
    // Calculate duration
    const startTime = new Date(transaction.startTime);
    const duration = Math.floor((new Date() - startTime) / 1000); // seconds
    
    // Directly publish to MQTT
    if (mqttClient) {
      const updateMessage = {
        timestamp: new Date().toISOString(),
        transactionId: parseInt(transactionId),
        chargePointId: stationId,
        energy: newEnergy,
        power: 11 + Math.random() * 5, // Simulated power between 11-16 kW
        batteryPercentage: Math.min(100, 20 + (newEnergy * 3)), // Simulated battery % based on energy
        duration
      };
      
      logger.info(`[SIMULATOR] Publishing energy update to MQTT: ${JSON.stringify(updateMessage)}`);
      
      // Publish to transaction and station-specific topics
      mqttClient.publish(`ocpp/transactions/${transactionId}/energy`, JSON.stringify(updateMessage));
      mqttClient.publish(`ocpp/stations/${stationId}/energy`, JSON.stringify(updateMessage));
    }
    
    res.json({
      success: true,
      message: `Successfully incremented energy for station ${stationId}, transaction ${transactionId}`,
      previousEnergy: currentEnergy,
      newEnergy,
      increment,
      transactionId
    });
    
  } catch (error) {
    logger.error(`[SIMULATOR] Error incrementing energy: ${error.message}`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
