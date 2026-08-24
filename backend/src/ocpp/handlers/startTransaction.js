const logger = require('../../utils/logger');
const { ChargingStation, Transaction, Connector } = require('../../models');
const mqttClient = require('../../mqtt/client');
const tagAuthService = require('../../services/tagAuthorization');

/**
 * Handle StartTransaction request according to OCPP 1.6 specification
 * 
 * @param {string} chargePointId - ID of the charging station
 * @param {string} uniqueId - Message unique ID
 * @param {object} payload - StartTransaction payload
 * @returns {Array} OCPP response
 */
async function handleStartTransaction(chargePointId, uniqueId, payload) {
    try {
        logger.info(`Processing StartTransaction from ${chargePointId}: ${JSON.stringify(payload)}`);

        // Normalize the payload to handle different formats
        const normalizedPayload = {
            // Generate a transactionId if not provided
            transactionId: payload.transactionId || Math.floor(Math.random() * 1000000) + 1,
            connectorId: payload.connectorId || 1,
            idTag: payload.idTag,
            timestamp: payload.timestamp || new Date().toISOString(),
            meterStart: payload.meterStart || 0,
            reservationId: payload.reservationId
        };

        // Verify that the ID tag is authorized
        const authResult = await tagAuthService.isAuthorized(normalizedPayload.idTag);
        
        // If tag is not accepted, reject the transaction
        if (authResult.status !== 'Accepted') {
            logger.warn(`Rejected transaction start from ${chargePointId}: Tag ${normalizedPayload.idTag} status is ${authResult.status}`);
            
            return [3, uniqueId, {
                transactionId: 0,
                idTagInfo: {
                    status: authResult.status,
                    expiryDate: authResult.expiryDate
                }
            }];
        }
        
        // Check if station exists
        const station = await ChargingStation.findOne({
            where: { chargePointId }
        });
        
        if (!station) {
            logger.warn(`Station ${chargePointId} not found, creating new record`);
            // Auto-create station if it doesn't exist
            await ChargingStation.create({
                chargePointId,
                status: 'Available'
            });
        }
        
        // Check connector status if possible
        let connector;
        try {
            connector = await Connector.findOne({
                where: { 
                    chargePointId,
                    connectorId: normalizedPayload.connectorId
                }
            });
            
            if (!connector) {
                // Create connector if it doesn't exist
                connector = await Connector.create({
                    chargePointId,
                    connectorId: normalizedPayload.connectorId,
                    status: 'Available'
                });
            }
            
            // Update connector to Charging state
            await connector.update({
                status: 'Charging',
                transactionId: normalizedPayload.transactionId
            });
        } catch (connectorError) {
            logger.warn(`Connector error: ${connectorError.message}`);
            // Continue even if connector operations fail
        }
        
        // Check for existing active transaction on this connector
        const existingTransaction = await Transaction.findOne({
            where: {
                chargePointId,
                connectorId: normalizedPayload.connectorId,
                status: 'InProgress'
            }
        });

        if (existingTransaction) {
            logger.warn(`Active transaction ${existingTransaction.transactionId} already exists on connector ${normalizedPayload.connectorId}`);
            
            // Auto-stop existing transaction for robustness
            await existingTransaction.update({
                status: 'Completed',
                stopTime: new Date()
            });
            
            logger.info(`Auto-completed existing transaction ${existingTransaction.transactionId}`);
        }

        // Create a new transaction record
        const transaction = await Transaction.create({
            transactionId: normalizedPayload.transactionId,
            chargePointId,
            connectorId: normalizedPayload.connectorId,
            idTag: normalizedPayload.idTag,
            startTime: new Date(normalizedPayload.timestamp),
            startMeterValue: normalizedPayload.meterStart,
            status: 'InProgress'
        });
        
        logger.info(`Created transaction ${transaction.transactionId} for ${chargePointId}`);

        // Publish transaction start to MQTT
        mqttClient.publish(`ocpp/${chargePointId}/transaction/start`, JSON.stringify({
            ...normalizedPayload,
            timestamp: new Date().toISOString()
        }));

        // Return OCPP 1.6 compliant response with proper authorization
        return [3, uniqueId, {
            transactionId: normalizedPayload.transactionId,
            idTagInfo: {
                status: 'Accepted',
                expiryDate: authResult.expiryDate,
                parentIdTag: authResult.parentId
            }
        }];
    } catch (error) {
        logger.error(`Error handling StartTransaction from ${chargePointId}:`, error);
        
        // Generate fallback transaction ID for recovery
        const fallbackTransactionId = Math.floor(Math.random() * 1000000) + 1;
        logger.info(`Using fallback transaction ID: ${fallbackTransactionId} for error recovery`);

        // Return rejection with proper error information
        return [3, uniqueId, {
            transactionId: fallbackTransactionId,
            idTagInfo: {
                status: 'Invalid',
                info: 'Internal server error'
            }
        }];
    }
}

module.exports = handleStartTransaction;
