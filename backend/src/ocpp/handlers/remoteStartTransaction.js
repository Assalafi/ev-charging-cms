const logger = require('../../utils/logger');
const { ChargingStation, Connector, AuthorizedTag, Transaction, OcppMessage } = require('../../models');
const tagAuthService = require('../../services/tagAuthorization');
const mqttClient = require('../../mqtt/client');

/**
 * Handle RemoteStartTransaction request according to OCPP 1.6 specification
 * Section 5.4.5 of OCPP 1.6 specification defines this functionality
 * 
 * @param {object} ws - WebSocket connection
 * @param {Array} message - OCPP message
 * @returns {Array} OCPP response message
 */
async function handleRemoteStartTransaction(ws, message) {
    const [messageType, messageId, action, payload] = message;
    const stationId = ws.stationId;
    
    logger.info(`Processing RemoteStartTransaction for ${stationId}: ${JSON.stringify(payload)}`);
    
    // Validate payload
    if (!payload || !payload.idTag) {
        logger.warn(`Invalid RemoteStartTransaction payload: missing idTag`);
        return [3, messageId, {
            status: 'Rejected'
        }];
    }
    
    try {
        const { idTag, connectorId = 1, chargingProfile } = payload;
        
        // Verify station exists
        const station = await ChargingStation.findOne({
            where: { chargePointId: stationId }
        });
        
        if (!station) {
            logger.warn(`Station ${stationId} not found`);
            return [3, messageId, {
                status: 'Rejected'
            }];
        }
        
        // Verify tag is authorized
        const authResult = await tagAuthService.isAuthorized(idTag);
        if (authResult.status !== 'Accepted') {
            logger.warn(`Tag ${idTag} not authorized for station ${stationId}: ${authResult.status}`);
            return [3, messageId, {
                status: 'Rejected'
            }];
        }
        
        // Check if connector is available
        let connector;
        try {
            connector = await Connector.findOne({
                where: {
                    chargePointId: stationId,
                    connectorId: connectorId
                }
            });
            
            if (!connector) {
                logger.info(`Connector ${connectorId} not found for ${stationId}, attempting to create it`);
                // Create connector if it doesn't exist
                connector = await Connector.create({
                    chargePointId: stationId,
                    connectorId: connectorId,
                    status: 'Available'
                });
            }
            
            // OCPP 1.6 compliance: Only start transaction if connector is available
            if (connector.status !== 'Available') {
                logger.warn(`Connector ${connectorId} not available (${connector.status})`);
                return [3, messageId, {
                    status: 'Rejected'
                }];
            }
            
            // Check for active transaction on this connector using Sequelize model
            const activeTransaction = await Transaction.findOne({
                where: {
                    chargePointId: stationId,
                    connectorId: connectorId,
                    status: 'InProgress'
                }
            });
            
            if (activeTransaction) {
                logger.warn(`Active transaction already exists on connector ${connectorId}`);
                return [3, messageId, {
                    status: 'Rejected'
                }];
            }
            
            // Update connector status to Preparing
            await connector.update({ 
                status: 'Preparing',
                lastStatusUpdate: new Date()
            });
            
            // Pre-create a transaction record for tracking
            const transactionId = Math.floor(Math.random() * 1000000) + 1;
            
            // Create a transaction record in our database
            await Transaction.create({
                transactionId,
                chargePointId: stationId,
                connectorId: connectorId,
                idTag,
                startTime: new Date(),
                startMeterValue: 0,
                status: 'Pending'  // Use 'Pending' until charging station confirms with StartTransaction
            });
            
            // Record this as an outgoing message
            await OcppMessage.create({
                messageId,
                chargePointId: stationId,
                message_type: 'RemoteStartTransaction',
                status: 'Sent',
                timestamp: new Date(),
                payload: JSON.stringify(payload),
                direction: 'outbound'
            });
            
            // Publish to MQTT
            mqttClient.publish(`ocpp/${stationId}/remote_start`, JSON.stringify({
                idTag,
                connectorId,
                transactionId,
                timestamp: new Date().toISOString()
            }));
            
            logger.info(`RemoteStartTransaction accepted for ${stationId}-${connectorId} with tag ${idTag}`);
            
            // Return accepted response
            return [3, messageId, {
                status: 'Accepted'
            }];
        } catch (connectorError) {
            logger.error(`Error checking connector status: ${connectorError.message}`);
            return [3, messageId, {
                status: 'Rejected'
            }];
        }
    } catch (error) {
        logger.error(`Error handling RemoteStartTransaction for ${stationId}:`, error);
        return [3, messageId, {
            status: 'Rejected'
        }];
    }
}

module.exports = handleRemoteStartTransaction;
