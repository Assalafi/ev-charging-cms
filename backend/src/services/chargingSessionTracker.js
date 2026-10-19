/**
 * Charging Session Tracker Service
 * Tracks real-time energy consumption and battery percentage during charging sessions
 */
const logger = require('../utils/logger');
const eventEmitter = require('../utils/eventEmitter');

function energyToKwh(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return String(unit || 'Wh').toLowerCase() === 'wh' ? numeric / 1000 : numeric;
}

function powerToKw(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return String(unit || 'W').toLowerCase() === 'w' ? numeric / 1000 : numeric;
}

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
      const unit = energyEntry.unit || 'Wh';
      const energyValue = energyToKwh(energyEntry.value, unit);
      logger.info(`Normalizing energy reading ${energyEntry.value} ${unit} to ${energyValue} kWh`);
      
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
      session.currentPower = powerToKw(powerEntry.value, powerEntry.unit);
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
      startEnergy = energyToKwh(energyEntry.value, energyEntry.unit);
      logger.info(`Found starting energy in meter values: ${startEnergy} kWh`);
    } else if (startMeterValue !== undefined && startMeterValue !== null) {
      // Transaction.startMeterValue is stored in Wh across the backend.
      startEnergy = energyToKwh(startMeterValue, 'Wh');
      logger.info(`Using provided start meter value: ${startMeterValue} Wh (${startEnergy} kWh)`);
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
      batteryPercentage: session.currentSoc ?? null,
      startBatteryPercentage: session.startSoc ?? null,
      duration,
      startTime: session.startTime,
      lastUpdate: session.lastUpdate
    };
  }
  
  // Battery percentage is only exposed when the charger reports a real SoC
  // meter value. Vehicle capacity is not known to the CSMS, so estimating it
  // from energy would be misleading and is intentionally avoided.
  estimateBatteryPercentage(session) {
    return session?.currentSoc ?? null;
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
                  startBatteryPercentage: sessionData.startBatteryPercentage,
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
                  startBatteryPercentage: sessionData.startBatteryPercentage,
                  duration: sessionData.duration,
                  amount: calculatedAmount,
                  timestamp: new Date().toISOString()
                }));
                
                // Also publish specific transaction status update
                mqttClient.publish(`ocpp/transactions/${transactionId}/status`, JSON.stringify({
                  status: 'InProgress',
                  energy: sessionData.totalEnergy,
                  power: sessionData.currentPower,
                  batteryPercentage: sessionData.batteryPercentage,
                  startBatteryPercentage: sessionData.startBatteryPercentage,
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
        startBatteryPercentage: finalStats.startBatteryPercentage,
        endBatteryPercentage: finalStats.batteryPercentage,
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
      batteryPercentage: session.currentSoc ?? null,
      sessionDuration: Math.floor((new Date() - session.startTime) / 1000) // seconds
    };
  }

  calculateBatteryPercentage(sessionData, vehicleInfo) {
    // A vehicle battery capacity is not available in OCPP 1.6 session data.
    // Return only a charger-reported SoC; never fabricate a percentage from
    // energy delivered or an optional, unverified vehicle hint.
    return sessionData?.currentSoc ?? sessionData?.batteryPercentage ?? null;
  }
}

// Singleton instance
const chargingSessionTracker = new ChargingSessionTracker();

module.exports = chargingSessionTracker;
