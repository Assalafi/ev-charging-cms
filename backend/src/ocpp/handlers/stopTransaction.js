const logger = require('../../utils/logger');
const { sequelize } = require('../../models');
const mqttClient = require('../../mqtt/client');

/**
 * Handle StopTransaction request according to OCPP 1.6 specification
 * 
 * @param {string} chargePointId - ID of the charging station
 * @param {string} uniqueId - Message unique ID
 * @param {object} payload - StopTransaction payload
 * @returns {Array} OCPP response
 */
async function handleStopTransaction(chargePointId, uniqueId, payload) {
    try {
        logger.info(`Processing StopTransaction from ${chargePointId}: ${JSON.stringify(payload)}`);

        const { transactionId, idTag, timestamp, meterStop, reason } = payload;
        
        if (!transactionId) {
            logger.warn(`Missing transactionId in StopTransaction from ${chargePointId}`);
            return [3, uniqueId, {
                idTagInfo: { status: 'Invalid' }
            }];
        }

        // Get the transaction record
        const [transaction] = await sequelize.query(
            `SELECT * FROM transactions 
             WHERE "transactionId" = $1 AND "chargePointId" = $2`,
            { 
                bind: [transactionId, chargePointId],
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!transaction) {
            logger.warn(`Transaction ${transactionId} not found for station ${chargePointId}`);
            return [3, uniqueId, {
                idTagInfo: { status: 'Invalid' }
            }];
        }

        // If transaction is already completed, just acknowledge
        if (transaction.status !== 'InProgress') {
            logger.info(`Transaction ${transactionId} already completed (${transaction.status})`);
            return [3, uniqueId, {
                idTagInfo: { status: 'Accepted' }
            }];
        }

        // Verify tag authorization if provided
        let tagStatus = 'Accepted';
        if (idTag) {
            const [tag] = await sequelize.query(
                `SELECT * FROM authorized_tags WHERE tag_id = $1`,
                { 
                    bind: [idTag],
                    type: sequelize.QueryTypes.SELECT
                }
            );
            
            if (!tag || tag.status !== 'Active' || tag.blocked) {
                tagStatus = 'Invalid';
                logger.warn(`Invalid tag ${idTag} used to stop transaction ${transactionId}`);
            }
        }

        // Calculate energy delivered if available
        // OCPP meter values are in Wh (Watt-hours), convert to kWh by dividing by 1000
        let energyDelivered = 0;
        if (meterStop !== undefined && transaction.startMeterValue !== undefined) {
            energyDelivered = (meterStop - transaction.startMeterValue) / 1000;
        }

        // Update transaction record
        await sequelize.query(
            `UPDATE transactions 
             SET status = 'Completed', 
                 "stopTime" = $1, 
                 "stopMeterValue" = $2, 
                 "energyDelivered" = $3,
                 reason = $4
             WHERE "transactionId" = $5`,
            { 
                bind: [
                    timestamp ? new Date(timestamp) : new Date(),
                    meterStop || 0,
                    energyDelivered,
                    reason || null,
                    transactionId
                ],
                type: sequelize.QueryTypes.UPDATE
            }
        );
        
        logger.info(`Transaction ${transactionId} completed successfully`);

        // Update connector status
        try {
            await sequelize.query(
                `UPDATE connectors 
                 SET status = 'Available', 
                     "transactionId" = NULL,
                     "updatedAt" = NOW()
                 WHERE "chargePointId" = $1 AND "connectorId" = $2`,
                { 
                    bind: [chargePointId, transaction.connectorId || 1],
                    type: sequelize.QueryTypes.UPDATE
                }
            );
            logger.info(`Connector ${transaction.connectorId} set to Available`);
        } catch (connError) {
            logger.warn(`Could not update connector status: ${connError.message}`);
        }

        // Publish to MQTT
        mqttClient.publish(`ocpp/${chargePointId}/transaction/stop`, JSON.stringify({
            transactionId,
            connectorId: transaction.connectorId,
            idTag: idTag || transaction.idTag,
            timestamp: timestamp || new Date().toISOString(),
            meterStop,
            reason,
            energyDelivered
        }));

        // Return proper OCPP 1.6 response
        return [3, uniqueId, {
            idTagInfo: {
                status: tagStatus
            }
        }];
    } catch (error) {
        logger.error(`Error handling StopTransaction from ${chargePointId}:`, error);
        return [3, uniqueId, {
            idTagInfo: {
                status: 'Invalid'
            }
        }];
    }
}

module.exports = handleStopTransaction;
