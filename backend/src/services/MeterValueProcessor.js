/**
 * MeterValueProcessor service
 * Handles storing and processing meter values from OCPP MeterValues requests
 * Following the OCPP 1.6 specification with enhanced error handling
 */
const { sequelize, MeterValue, Transaction, Connector } = require('../models');
const logger = require('../utils/logger');

class MeterValueProcessor {
  constructor() {
    // Initialize with default values to prevent crash during startup
    this.latestValues = new Map();
    this.transactionValues = new Map();
    logger.info('MeterValueProcessor initialized');
  }

  /**
   * Process a MeterValues request and store relevant data
   * @param {string} chargePointId - ID of the charging station
   * @param {object} payload - MeterValues payload from OCPP
   * @returns {boolean} Success indicator
   */
  async processMeterValue(chargePointId, payload) {
    try {
      // Log raw MeterValues message for debugging
      logger.debug(`Raw MeterValues from ${chargePointId}: ${JSON.stringify(payload)}`);
      
      // Extract data from payload
      const connectorId = payload.connectorId || 1;
      const transactionId = payload.transactionId;
      const meterValues = payload.meterValue || [];

      if (!meterValues.length) {
        logger.warn(`No meter values in payload from ${chargePointId}`);
        return false;
      }

      // Count processed values for logging
      let processedCount = 0;
      let errorCount = 0;

      // Process each meter value using flat map approach for better handling
      const processedValues = [];
      
      for (const meterValue of meterValues) {
        const timestamp = new Date(meterValue.timestamp);
        const samples = meterValue.sampledValue || [];
        
        if (!samples.length) {
          logger.warn(`MeterValue without sampledValue from ${chargePointId} at ${timestamp.toISOString()}`);
          continue;
        }

        // Process each sample in this meter value
        for (const sample of samples) {
          try {
            // Normalize the sample data (handle missing fields)
            const normalizedSample = this.normalizeMeterValue(sample);
            
            // Create processed value object
            const processedValue = {
              chargePointId,
              connectorId,
              transactionId,
              timestamp,
              value: parseFloat(normalizedSample.value),
              measurand: normalizedSample.measurand,
              unit: normalizedSample.unit,
              phase: normalizedSample.phase,
              context: normalizedSample.context
            };
            
            processedValues.push(processedValue);
            
            // Store as latest value for this connector if it's an energy reading
            if (normalizedSample.measurand === 'Energy.Active.Import.Register') {
              this.storeLatestValue(chargePointId, connectorId, processedValue.value);
              
              // If associated with a transaction, store with transaction ID
              if (transactionId) {
                this.storeTransactionValue(transactionId, processedValue.value);
              }
              
              // Update connector's meter value
              await this.updateConnectorMeterValue(chargePointId, connectorId, processedValue.value);
            }
            
            processedCount++;
          } catch (sampleError) {
            logger.error(`Error processing sample from ${chargePointId}:`, sampleError);
            errorCount++;
          }
        }
      }

      // Store all processed values in the database in a single operation if possible
      if (processedValues.length > 0) {
        try {
          await this.saveMeterValuesToDb(processedValues);
          logger.info(`Stored ${processedValues.length} meter values for ${chargePointId}`);
        } catch (dbError) {
          logger.error(`Database error storing meter values for ${chargePointId}:`, dbError);
          return false;
        }
      }

      logger.debug(`MeterValues processing complete: ${processedCount} processed, ${errorCount} errors`);
      return processedCount > 0;
    } catch (error) {
      logger.error(`Error processing meter values from ${chargePointId}:`, error);
      return false;
    }
  }
  
  /**
   * Normalize meter value to ensure all required fields are present
   * @param {object|string|number} value - Raw meter value from OCPP message
   * @returns {object} Normalized meter value with all required fields
   */
  normalizeMeterValue(value) {
    // Handle cases where only a value is provided as string or number
    if (typeof value === 'string' || typeof value === 'number') {
      return {
        value: parseFloat(value),
        measurand: 'Energy.Active.Import.Register',
        unit: 'Wh',
        context: 'Sample.Periodic',
        phase: null
      };
    }
    
    // Handle object with only value property
    if (typeof value === 'object' && 'value' in value) {
      // Fill in defaults for partial objects
      return {
        value: parseFloat(value.value),
        measurand: value.measurand || 'Energy.Active.Import.Register',
        unit: value.unit || 'Wh',
        phase: value.phase || null,
        context: value.context || 'Sample.Periodic'
      };
    }
    
    // Handle invalid input
    throw new Error(`Invalid meter value format: ${JSON.stringify(value)}`);
  }

  /**
   * Store latest meter value for a specific connector
   * @param {string} chargePointId - ID of the charging station
   * @param {number} connectorId - ID of the connector
   * @param {number} value - Meter reading value
   */
  storeLatestValue(chargePointId, connectorId, value) {
    const key = `${chargePointId}:${connectorId}`;
    this.latestValues.set(key, {
      value,
      timestamp: new Date()
    });
    logger.debug(`Stored latest value for ${key}: ${value}`);
  }

  /**
   * Store meter value for a specific transaction
   * @param {number} transactionId - ID of the transaction
   * @param {number} value - Meter reading value
   */
  storeTransactionValue(transactionId, value) {
    if (!this.transactionValues.has(transactionId)) {
      this.transactionValues.set(transactionId, []);
    }

    this.transactionValues.get(transactionId).push({
      value,
      timestamp: new Date()
    });

    logger.debug(`Stored transaction value for transaction ${transactionId}: ${value}`);
  }

  /**
   * Get latest meter value for a specific connector
   * @param {string} chargePointId - ID of the charging station
   * @param {number} connectorId - ID of the connector
   * @returns {object|null} Latest meter value with timestamp or null if not found
   */
  getLatestValue(chargePointId, connectorId) {
    const key = `${chargePointId}:${connectorId}`;
    return this.latestValues.get(key) || null;
  }

  /**
   * Get meter values for a specific transaction
   * @param {number} transactionId - ID of the transaction
   * @returns {Array} Array of meter values with timestamps
   */
  getTransactionValues(transactionId) {
    return this.transactionValues.get(transactionId) || [];
  }
  
  /**
   * Get the calculated energy consumption for a transaction
   * @param {number} transactionId - ID of the transaction
   * @returns {number} Energy consumption in Wh
   */
  getTransactionEnergy(transactionId) {
    try {
      const values = this.getTransactionValues(transactionId);
      
      if (!values || values.length === 0) {
        logger.debug(`No transaction values found for transaction ${transactionId}`);
        return 0;
      }
      
      // Sort values by timestamp to ensure we get the latest
      values.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Return the latest value (which should be the accumulated energy)
      const latest = values[values.length - 1];
      logger.debug(`Latest energy value for transaction ${transactionId}: ${latest.value}`);
      return latest.value;
    } catch (error) {
      logger.error(`Error calculating transaction energy for ${transactionId}:`, error);
      return 0;
    }
  }

  /**
   * Save a single meter value to database
   * @param {object} data - Meter value data
   * @returns {Promise} Database operation promise
   */
  async saveMeterValueToDb(data) {
    try {
      // CRITICAL FIX: The meter_values.transactionId links to transactions.id (NOT transactions.transactionId)
      // We need to find the internal database ID based on the OCPP transactionId
      let internalTransactionId = null;
      
      if (data.transactionId) {
        try {
          const transaction = await Transaction.findOne({
            where: { transactionId: data.transactionId },
            attributes: ['id'] // Just get the internal ID
          });
          
          if (transaction) {
            // Use the internal ID instead of the OCPP transactionId
            internalTransactionId = transaction.id;
            logger.debug(`Mapped OCPP transactionId ${data.transactionId} to internal ID ${internalTransactionId}`);
          } else {
            logger.warn(`Transaction with OCPP ID ${data.transactionId} not found in database`);
          }
        } catch (lookupError) {
          logger.error(`Error looking up transaction: ${lookupError.message}`);
        }
      }
      
      // Direct SQL insert to ensure proper field mapping
      const result = await sequelize.query(
        `INSERT INTO meter_values (
          "chargePointId", 
          "connectorId", 
          "transactionId", 
          "timestamp", 
          "value", 
          "unit", 
          "measurand", 
          "phase",
          "location",
          "context", 
          "createdAt", 
          "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING id`,
        { 
          bind: [
            data.chargePointId,
            data.connectorId,
            internalTransactionId, // This is the internal ID from the transactions table
            data.timestamp,
            parseFloat(data.value),
            data.unit || 'Wh',
            data.measurand || 'Energy.Active.Import.Register',
            data.phase || null,
            data.location || null,
            data.context || 'Sample.Periodic'
          ],
          type: sequelize.QueryTypes.INSERT 
        }
      );
      
      logger.info(`Successfully inserted meter value with ID: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`Error inserting meter value: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save multiple meter values to database in one operation
   * @param {Array<object>} values - Array of meter value data objects
   * @returns {Promise} Database operation promise
   */
  async saveMeterValuesToDb(values) {
    if (!values || values.length === 0) {
      logger.warn('No meter values to save');
      return;
    }
    
    logger.info(`Processing ${values.length} meter values for storage`);
    
    // Process each meter value individually using direct SQL
    // This is more reliable than bulkCreate given the current issues
    const results = [];
    let successCount = 0;
    
    for (const data of values) {
      try {
        const result = await this.saveMeterValueToDb(data);
        results.push(result);
        successCount++;
      } catch (error) {
        logger.error(`Failed to insert meter value for ${data.chargePointId}: ${error.message}`);
      }
    }
    
    logger.info(`Meter value storage complete: ${successCount}/${values.length} successful`);
    return results;
  }

  /**
   * Update connector's stored meter value
   * @param {string} chargePointId - ID of the charging station
   * @param {number} connectorId - ID of the connector
   * @param {number} meterValue - Current meter reading
   */
  async updateConnectorMeterValue(chargePointId, connectorId, meterValue) {
    try {
      // Find the connector
      const connector = await Connector.findOne({
        where: {
          chargePointId,
          connectorId
        }
      });

      if (connector) {
        // Update connector with latest meter value
        await connector.update({
          meterValue,
          lastMeterUpdate: new Date()
        });
        logger.debug(`Updated connector ${connectorId} meter value for station ${chargePointId}: ${meterValue}`);
      } else {
        // Create connector if it doesn't exist
        await Connector.create({
          chargePointId,
          connectorId,
          status: 'Available',
          meterValue,
          lastMeterUpdate: new Date()
        });
        logger.info(`Created new connector ${connectorId} for station ${chargePointId} with meter value: ${meterValue}`);
      }
    } catch (error) {
      logger.error(`Error updating connector meter value for ${chargePointId}/${connectorId}:`, error);
    }
  }
}

// Create singleton instance
const meterValueProcessor = new MeterValueProcessor();

module.exports = meterValueProcessor;
