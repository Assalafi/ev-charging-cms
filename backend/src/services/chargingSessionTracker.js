/**
 * Charging Session Tracker Service
 * Tracks real-time energy consumption and battery percentage during charging sessions
 */
const logger = require('../utils/logger');
const eventEmitter = require('../utils/eventEmitter');

class ChargingSessionTracker {
  constructor() {
    this.activeTransactions = new Map(); // transactionId -> session data
    logger.info('ChargingSessionTracker initialized');
  }

  startSession(transactionId, meterValue, startMeterValue) {
    logger.info(`Starting real-time tracking for transaction ${transactionId} with initial meter value: ${startMeterValue}`);
    
    // Initialize session with provided start meter value
    this.initializeSession(transactionId, meterValue, startMeterValue);
    
    return this.getSessionStats(transactionId);
  }
  
  updateMeterValue(transactionId, meterValue) {
    if (!this.activeTransactions.has(transactionId)) {
      this.initializeSession(transactionId, meterValue);
      return null;
    }

    const session = this.activeTransactions.get(transactionId);
    
    logger.info(`Processing meter values for transaction ${transactionId}: ${JSON.stringify(meterValue)}`);
    
    // Process according to the example code the user provided
    // Flatten the array structure to handle both formats
    const flattenedMeterValues = [];
    for (const sample of meterValue) {
      if (sample.sampledValue && Array.isArray(sample.sampledValue)) {
        for (const value of sample.sampledValue) {
          flattenedMeterValues.push(value);
        }
      } else if (sample.measurand) {
        // Handle case where the meter value might be a direct object
        flattenedMeterValues.push(sample);
      }
    }
    
    // Find the energy entry as in the example
    const energyEntry = flattenedMeterValues.find(v => 
      v.measurand === 'Energy.Active.Import.Register'
    );

    if (energyEntry) {
      const previousEnergy = session.currentEnergy;
      
      // Extract value and handle unit conversion if present
      let energyValue = parseFloat(energyEntry.value);
      const unit = energyEntry.unit?.toLowerCase() || '';
      
      // Convert to kWh if in Wh
      if (unit === 'wh') {
        energyValue = energyValue / 1000;
        logger.info(`Converting energy from Wh to kWh: ${energyValue} kWh`);
      }
      
      session.currentEnergy = energyValue;
      session.energyConsumed = session.currentEnergy - session.startEnergy;
      session.lastUpdate = new Date();
      
      logger.info(`Transaction ${transactionId}: Energy update - current: ${session.currentEnergy.toFixed(2)} kWh, consumed: ${session.energyConsumed.toFixed(2)} kWh`);
      
      // Calculate power (kW) if interval available
      if (session.lastEnergyUpdate) {
        const timeDiff = (session.lastUpdate - session.lastEnergyUpdate) / 3600000; // hours
        if (timeDiff > 0) {
          const energyDiff = session.currentEnergy - session.lastEnergyValue;
          session.currentPower = energyDiff / timeDiff; // kW
          logger.info(`Transaction ${transactionId}: Calculated power: ${session.currentPower.toFixed(2)} kW over ${(timeDiff * 60).toFixed(1)} minutes`);
        }
      }
      
      session.lastEnergyValue = session.currentEnergy;
      session.lastEnergyUpdate = session.lastUpdate;
    }
    
    // Find direct power reading
    const powerEntry = flattenedMeterValues.find(v => 
      v.measurand === 'Power.Active.Import'
    );
    
    if (powerEntry) {
      session.currentPower = parseFloat(powerEntry.value);
      logger.info(`Transaction ${transactionId}: Direct power reading: ${session.currentPower.toFixed(2)} kW`);
    }
    
    // Find SoC reading
    const socEntry = flattenedMeterValues.find(v => 
      v.measurand === 'SoC'
    );
    
    if (socEntry) {
      session.currentSoc = parseFloat(socEntry.value);
      logger.info(`Transaction ${transactionId}: SoC update: ${session.currentSoc.toFixed(1)}%`);
    }
    
    // Update transaction total energy in database if significant change
    if (session.energyConsumed > 0) {
      // Emit update to publish to MQTT
      return this.emitSessionUpdate(transactionId);
    }
    
    return null;
  }

  initializeSession(transactionId, meterValue, startMeterValue) {
    logger.info(`Initializing charging session tracker for transaction ${transactionId}`);
    
    // Flatten the meter values for easier processing
    const flattenedMeterValues = [];
    for (const sample of meterValue) {
      if (sample.sampledValue && Array.isArray(sample.sampledValue)) {
        for (const value of sample.sampledValue) {
          flattenedMeterValues.push(value);
        }
      } else if (sample.measurand) {
        flattenedMeterValues.push(sample);
      }
    }
    
    // Find the energy entry as in the example
    const energyEntry = flattenedMeterValues.find(v => 
      v.measurand === 'Energy.Active.Import.Register'
    );
    
    let startEnergy = 0;
    if (energyEntry) {
      startEnergy = parseFloat(energyEntry.value);
      logger.info(`Found starting energy in meter values: ${startEnergy} kWh`);
    } else if (startMeterValue !== undefined && startMeterValue !== null) {
      startEnergy = parseFloat(startMeterValue);
      logger.info(`Using provided start meter value: ${startEnergy} kWh`);
    } else {
      logger.warn(`No energy value found for transaction ${transactionId}, initializing at 0`);
    }
    
    // Find SoC if available
    const socEntry = flattenedMeterValues.find(v => 
      v.measurand === 'SoC'
    );
    
    let startSoc = null;
    if (socEntry) {
      startSoc = parseFloat(socEntry.value);
      logger.info(`Found starting SoC in meter values: ${startSoc}%`);
    }
    
    this.activeTransactions.set(transactionId, {
      startTime: new Date(),
      startEnergy,
      currentEnergy: startEnergy,
      energyConsumed: 0,
      currentPower: 0,
      startSoc,
      currentSoc: startSoc,
      lastUpdate: new Date(),
      lastEnergyValue: startEnergy,
      lastEnergyUpdate: new Date()
    });
    
    logger.info(`Session initialized for transaction ${transactionId} starting at ${startEnergy} kWh`);
    
    // Emit initial state
    this.emitSessionUpdate(transactionId);
  }

  getSessionStats(transactionId) {
    const session = this.activeTransactions.get(transactionId);
    if (!session) return null;
    
    // Calculate duration in seconds
    const now = new Date();
    const startTime = session.startTime || now;
    const duration = Math.floor((now - startTime) / 1000);
    
    // Log the details for debugging
    logger.info(`Session stats for ${transactionId}: Start time: ${startTime.toISOString()}, Duration: ${duration}s, Energy: ${session.energyConsumed * 1000} Wh, Power: ${session.currentPower * 1000 || 0} W`);
    
    return {
      transactionId,
      totalEnergy: session.energyConsumed * 1000, // Convert kWh to Wh for consistency
      currentPower: session.currentPower * 1000 || 0, // Convert kW to W
      duration,
      startTime: session.startTime,
      lastUpdate: session.lastUpdate
    };
  }
  
  // Estimate battery percentage based on energy consumed if SoC not available
  estimateBatteryPercentage(session) {
    // If we have a real SoC value, use it
    if (session.currentSoc !== null && session.currentSoc !== undefined) {
      return session.currentSoc;
    }
    
    // No way to estimate without start SoC
    if (session.startSoc === null || session.startSoc === undefined) {
      return null;
    }
    
    // Very rough estimation based on typical EV battery (60kWh)
    // This is just a placeholder - real vehicles would provide SoC in OCPP messages
    const typicalEvBatterySize = 60; // kWh
    const estimatedSoc = Math.max(0, Math.min(100, session.startSoc - (session.energyConsumed / typicalEvBatterySize * 100)));
    
    return Math.round(estimatedSoc);
  }

  emitSessionUpdate(transactionId) {
    const session = this.activeTransactions.get(transactionId);
    if (!session) return;
    
    const sessionData = this.getSessionStats(transactionId);
    if (sessionData) {
      // Emit update event locally
      eventEmitter.emit('session-update', sessionData);
      
      // Get the mqttClient directly from the shared module
      const mqttClient = require('../mqtt/client');
      
      // If we have MQTT, publish the update directly from here
      if (mqttClient) {
        try {
          // Get chargePointId from active transaction in database
          const Transaction = require('../models').Transaction;
          Transaction.findOne({ where: { transactionId } })
            .then(async (transaction) => {
              if (transaction) {
                // If transaction is Completed but tracker is still active, the charger
                // is still physically charging. The handleMeterValues handler will reopen
                // the transaction. We just skip the DB update here to avoid conflicts.
                if (transaction.status !== 'InProgress') {
                  logger.info(`MQTT Direct: tx ${transactionId} status is ${transaction.status}, skipping tracker DB update (handleMeterValues will handle reopen)`);
                  return;
                }

                const chargePointId = transaction.chargePointId;
                
                // Calculate amount based on energy for real-time price tracking
                let calculatedAmount = 0;
                try {
                  const { ChargingStation, Location } = require('../models');
                  const stationForPrice = await ChargingStation.findOne({
                    where: { chargePointId },
                    attributes: ['locationId']
                  });
                  let pricePerWh = 0.4;
                  let minimumCharge = 150;
                  if (stationForPrice && stationForPrice.locationId) {
                    const location = await Location.findByPk(stationForPrice.locationId);
                    if (location) {
                      pricePerWh = location.pricePerWh ?? 0.4;
                      minimumCharge = location.minimumCharge ?? 150;
                    }
                  }
                  const ratePerKwh = pricePerWh * 1000;
                  // totalEnergy is in Wh, convert to kWh
                  const energyInKwh = sessionData.totalEnergy / 1000;
                  calculatedAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge);
                } catch (priceErr) {
                  logger.error(`MQTT Direct: Price calc error: ${priceErr.message}`);
                }

                // Create energy update message - using the raw value without conversion
                const updateMessage = {
                  timestamp: new Date().toISOString(),
                  transactionId: transactionId,
                  chargePointId,
                  energy: sessionData.totalEnergy, // Keep original value (Wh)
                  power: sessionData.currentPower,
                  batteryPercentage: sessionData.batteryPercentage,
                  duration: sessionData.duration,
                  amount: calculatedAmount
                };
                
                logger.info(`MQTT Direct: Publishing energy update from tracker: ${JSON.stringify(updateMessage)}`);
                
                // Publish to both transaction and station topics
                mqttClient.publish(`ocpp/transactions/${transactionId}/energy`, JSON.stringify(updateMessage));
                mqttClient.publish(`ocpp/stations/${chargePointId}/energy`, JSON.stringify(updateMessage));
                
                // Also publish to the charging station status topic for UI real-time updates
                mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
                  connectorId: transaction.connectorId,
                  status: 'Charging',
                  transactionId: transactionId,
                  energy: sessionData.totalEnergy,
                  power: sessionData.currentPower,
                  batteryPercentage: sessionData.batteryPercentage,
                  duration: sessionData.duration,
                  amount: calculatedAmount,
                  timestamp: new Date().toISOString()
                }));
                
                // Also publish specific transaction status update
                mqttClient.publish(`ocpp/transactions/${transactionId}/status`, JSON.stringify({
                  status: 'InProgress',
                  energy: sessionData.totalEnergy,
                  power: sessionData.currentPower,
                  duration: sessionData.duration,
                  amount: calculatedAmount,
                  timestamp: new Date().toISOString()
                }));
                
                // Note: Transaction DB updates are handled by messageHandlers.js (OCPP meter values)
                // Tracker only publishes real-time MQTT updates to avoid energy unit conflicts
              }
            })
            .catch(err => {
              logger.error(`MQTT Direct: Error finding transaction: ${err.message}`);
            });
        } catch (error) {
          logger.error(`MQTT Direct: Error publishing energy update: ${error.message}`);
        }
      }
      
      return sessionData;
    }
    
    return null;
  }

  endSession(transactionId, finalMeterValue) {
    logger.info(`Ending charging session tracker for transaction ${transactionId}`);
    
    // Get final session data before removing
    const finalSession = this.activeTransactions.get(transactionId);
    
    if (finalSession) {
      // Update with final meter value if provided
      if (finalMeterValue !== undefined && finalMeterValue !== null) {
        finalSession.currentEnergy = parseFloat(finalMeterValue);
        finalSession.energyConsumed = finalSession.currentEnergy - finalSession.startEnergy;
      }
      
      // Final session stats
      const finalStats = this.getSessionStats(transactionId);
      
      // Create final session data object
      const finalData = {
        transactionId,
        totalEnergy: finalStats.totalEnergy,
        currentPower: 0, // Power is 0 at end
        batteryPercentage: finalStats.batteryPercentage,
        sessionDuration: Math.floor((new Date() - finalSession.startTime) / 1000), // seconds
        isCompleted: true
      };
      
      // Emit both events for different subscribers
      eventEmitter.emit('session-end', finalData);
      eventEmitter.emit('session-update', finalData);
      
      // Log the final energy values
      logger.info(`Charging session ${transactionId} ended with ${finalData.totalEnergy.toFixed(2)} Wh consumed`);
      
      // Remove from active sessions
      this.activeTransactions.delete(transactionId);
      
      return finalData;
    }
    
    return null;
  }

  getSessionData(transactionId) {
    const session = this.activeTransactions.get(transactionId);
    if (!session) return null;
    
    return {
      transactionId,
      energyConsumed: session.energyConsumed,
      currentPower: session.currentPower,
      currentSoc: session.currentSoc,
      sessionDuration: Math.floor((new Date() - session.startTime) / 1000) // seconds
    };
  }

  calculateBatteryPercentage(sessionData, vehicleInfo) {
    // Method 1: Direct from SoC measurement
    if (sessionData.currentSoc !== null && sessionData.currentSoc !== undefined) {
      return sessionData.currentSoc; // Already a percentage
    }
    
    // Method 2: Estimate from energy consumed
    if (vehicleInfo?.batteryCapacity) {
      const estimatedSoc = Math.min(
        100,
        (sessionData.energyConsumed / vehicleInfo.batteryCapacity) * 100
      );
      return Math.round(estimatedSoc);
    }
    
    return null; // Not enough data
  }
}

// Singleton instance
const chargingSessionTracker = new ChargingSessionTracker();

module.exports = chargingSessionTracker;
