const logger = require('../../utils/logger');
const { Transaction, Connector, OcppMessage } = require('../../models');
const mqttClient = require('../../mqtt/client');

/**
 * Handle RemoteStopTransaction request according to OCPP 1.6 specification
 * Section 5.4.4 of OCPP 1.6 specification defines this functionality
 * 
 * @param {object} ws - WebSocket connection
 * @param {Array} message - OCPP message
 * @returns {Array} OCPP response message
 */
async function handleRemoteStopTransaction(ws, message) {
    const [messageType, messageId, action, payload] = message;
    const stationId = ws.stationId;
    
    logger.info(`Processing RemoteStopTransaction for ${stationId}: ${JSON.stringify(payload)}`);
    
    // Validate payload
    if (!payload || typeof payload.transactionId !== 'number') {
        logger.warn(`Invalid RemoteStopTransaction payload from Central System to ${stationId}`);
        return [3, messageId, {
            status: 'Rejected',
            errorCode: 'FormationViolation',
            info: 'Missing or invalid transactionId'
        }];
    }
    
    try {
        const { transactionId } = payload;
        
        // Check if transaction exists and is active - using Sequelize model as required
        // First try to find by the exact transactionId
        let transaction = await Transaction.findOne({
            where: { 
                transactionId: transactionId,
                chargePointId: stationId,
                status: 'InProgress'
            }
        });

        // If not found, and the transactionId is 0, find the latest active transaction for this station
        // This is a common case where the CMS doesn't know the exact ID and uses 0 as a wildcard
        if (!transaction && transactionId === 0) {
            logger.info(`No transaction found with ID 0, looking for any active transaction for ${stationId}`);
            transaction = await Transaction.findOne({
                where: { 
                    chargePointId: stationId,
                    status: 'InProgress'
                },
                order: [['startTime', 'DESC']]
            });
            
            if (transaction) {
                logger.info(`Found active transaction ${transaction.transactionId} for station ${stationId}`);
            }
        }
        
        if (!transaction) {
            logger.warn(`Transaction ${transactionId} not found for station ${stationId}`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'NoTransaction',
                info: `Transaction ${transactionId} not found`
            }];
        }
        
        if (transaction.status !== 'InProgress') {
            logger.warn(`Transaction ${transactionId} is not in progress (${transaction.status})`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'NoTransaction',
                info: `Transaction is not active (${transaction.status})`
            }];
        }
        
        // Find the connector associated with this transaction
        const connector = await Connector.findOne({
            where: { 
                chargePointId: stationId,
                connectorId: transaction.connectorId
            }
        });
        
        const connectorStatus = connector ? connector.status : 'Unknown';
        logger.info(`Current connector status for ${stationId}-${transaction.connectorId}: ${connectorStatus}`);
        
        // Update transaction status to 'Completing' in our database immediately
        // This is for state tracking - the actual transaction stop happens on the charging station
        await transaction.update({
            status: 'Completing',
            stopTime: new Date()
        });
        
        // Update connector status if we have a connector
        if (connector) {
            await connector.update({
                status: 'Finishing',
                lastStatusUpdate: new Date()
            });
        }
        
        // Record this remote stop transaction in our logs
        await OcppMessage.create({
            messageId,
            chargePointId: stationId,
            message_type: 'RemoteStopTransaction',
            status: 'Sent',
            timestamp: new Date(),
            payload: JSON.stringify({ transactionId: transaction.transactionId }),
            direction: 'outbound'
        });
        
        // Publish to MQTT for monitoring
        mqttClient.publish(`ocpp/${stationId}/remote_stop`, JSON.stringify({
            transactionId: transaction.transactionId,
            timestamp: new Date().toISOString()
        }));
        
        logger.info(`RemoteStopTransaction for transaction ${transaction.transactionId} accepted, waiting for StopTransaction from station`);
        
        // Return accepted response
        return [3, messageId, {
            status: 'Accepted'
        }];
    } catch (error) {
        logger.error(`Error handling RemoteStopTransaction for ${stationId}:`, error);
        return [3, messageId, {
            status: 'Rejected',
            errorCode: 'InternalError',
            info: 'Internal server error'
        }];
    }
}

module.exports = handleRemoteStopTransaction;
