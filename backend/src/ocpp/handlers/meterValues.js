const logger = require('../../utils/logger');
const { sequelize } = require('../../models');
const mqttClient = require('../../mqtt/client');

/**
 * Handle MeterValues request according to OCPP 1.6 specification
 * 
 * @param {string} chargePointId - ID of the charging station
 * @param {string} uniqueId - Message unique ID
 * @param {object} payload - MeterValues payload
 * @returns {Array} OCPP response
 */
async function handleMeterValues(chargePointId, uniqueId, payload) {
    try {
        logger.debug(`Processing MeterValues from ${chargePointId}: ${JSON.stringify(payload)}`);

        const { connectorId, transactionId, meterValue } = payload;
        
        if (!meterValue || !Array.isArray(meterValue) || meterValue.length === 0) {
            logger.warn(`Invalid meterValue in MeterValues from ${chargePointId}`);
            return [3, uniqueId, {}]; // Still return success per OCPP spec
        }

        // Process each meter value
        for (const value of meterValue) {
            const { timestamp, sampledValue } = value;
            
            if (!sampledValue || !Array.isArray(sampledValue)) {
                continue;
            }
            
            // Process each sampled value
            for (const sample of sampledValue) {
                const {
                    value: meterValue,
                    context = 'Sample.Periodic',
                    format = 'Raw',
                    measurand = 'Energy.Active.Import.Register',
                    phase = null,
                    location = 'Outlet',
                    unit = 'Wh'
                } = sample;
                
                // Store in database if we have meter_values table
                try {
                    await sequelize.query(
                        `INSERT INTO meter_values 
                         ("chargePointId", "connectorId", "transactionId", "timestamp", 
                          value, context, format, measurand, phase, location, unit) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                        {
                            bind: [
                                chargePointId,
                                connectorId,
                                transactionId,
                                new Date(timestamp),
                                parseFloat(meterValue),
                                context,
                                format,
                                measurand,
                                phase,
                                location,
                                unit
                            ],
                            type: sequelize.QueryTypes.INSERT
                        }
                    );
                } catch (dbError) {
                    // If table doesn't exist, just log warning
                    if (!dbError.message.includes('relation "meter_values" does not exist')) {
                        logger.warn(`Error storing meter value: ${dbError.message}`);
                    }
                }
                
                // If this is a transaction, update the transaction's current meter value
                if (transactionId) {
                    // Only update for Energy.Active.Import.Register (default) or energy measurands
                    if (measurand.includes('Energy.Active.Import')) {
                        try {
                            await sequelize.query(
                                `UPDATE transactions 
                                 SET "currentMeterValue" = $1, "updatedAt" = NOW() 
                                 WHERE "transactionId" = $2 AND "chargePointId" = $3 AND status = 'InProgress'`,
                                {
                                    bind: [parseFloat(meterValue), transactionId, chargePointId],
                                    type: sequelize.QueryTypes.UPDATE
                                }
                            );
                        } catch (txError) {
                            logger.warn(`Could not update transaction meter value: ${txError.message}`);
                        }
                    }
                }
                
                // Update connector meter value
                try {
                    await sequelize.query(
                        `UPDATE connectors 
                         SET "meterValue" = $1, "updatedAt" = NOW() 
                         WHERE "chargePointId" = $2 AND "connectorId" = $3`,
                        {
                            bind: [parseFloat(meterValue), chargePointId, connectorId],
                            type: sequelize.QueryTypes.UPDATE
                        }
                    );
                } catch (connError) {
                    logger.warn(`Could not update connector meter value: ${connError.message}`);
                }
            }
        }

        // Publish to MQTT with the most relevant value
        const energyValue = extractEnergyValue(meterValue);
        mqttClient.publish(`ocpp/${chargePointId}/meter`, JSON.stringify({
            connectorId,
            transactionId,
            timestamp: new Date().toISOString(),
            value: energyValue
        }));

        // Return empty response as per OCPP 1.6
        return [3, uniqueId, {}];
    } catch (error) {
        logger.error(`Error handling MeterValues from ${chargePointId}:`, error);
        return [3, uniqueId, {}]; // Still return success per OCPP spec
    }
}

/**
 * Extract the most relevant energy value from meter values
 */
function extractEnergyValue(meterValue) {
    if (!meterValue || !Array.isArray(meterValue) || meterValue.length === 0) {
        return null;
    }
    
    // Try to find Energy.Active.Import.Register first
    for (const value of meterValue) {
        if (!value.sampledValue || !Array.isArray(value.sampledValue)) {
            continue;
        }
        
        for (const sample of value.sampledValue) {
            if (sample.measurand === 'Energy.Active.Import.Register') {
                return parseFloat(sample.value);
            }
        }
    }
    
    // Fall back to any energy value
    for (const value of meterValue) {
        if (!value.sampledValue || !Array.isArray(value.sampledValue)) {
            continue;
        }
        
        for (const sample of value.sampledValue) {
            if (sample.measurand && sample.measurand.includes('Energy')) {
                return parseFloat(sample.value);
            }
        }
    }
    
    // Fall back to first value
    if (meterValue[0].sampledValue && meterValue[0].sampledValue[0]) {
        return parseFloat(meterValue[0].sampledValue[0].value);
    }
    
    return null;
}

module.exports = handleMeterValues;
