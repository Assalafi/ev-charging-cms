const logger = require('../../utils/logger');
const { ChargingStation } = require('../../models');
const mqttClient = require('../../mqtt/client');

/**
 * Handle Heartbeat request according to OCPP 1.6 specification
 * 
 * @param {string} chargePointId - ID of the charging station
 * @param {string} uniqueId - Message unique ID
 * @returns {Array} OCPP response
 */
async function handleHeartbeat(chargePointId, uniqueId) {
    try {
        logger.debug(`Received Heartbeat from ${chargePointId}`);

        // Update last heartbeat time using Sequelize model
        try {
            // First check if the station exists
            let station = await ChargingStation.findOne({
                where: { chargePointId }
            });
            
            if (station) {
                // If station exists, update it
                await station.update({
                    lastSeen: new Date(), // Using lastSeen instead of lastHeartbeatTime
                    status: 'Connected'
                });
            } else {
                // If station doesn't exist, create it
                await ChargingStation.create({
                    chargePointId,
                    status: 'Connected',
                    lastSeen: new Date()
                });
                logger.info(`Created new charging station record for ${chargePointId}`);
            }
        } catch (dbError) {
            logger.error(`Database error during Heartbeat from ${chargePointId}:`, dbError);
            // Continue even if DB update fails
        }

        // Publish heartbeat to MQTT
        mqttClient.publish(`ocpp/${chargePointId}/heartbeat`, JSON.stringify({
            timestamp: new Date().toISOString()
        }));

        // Return standard heartbeat response as per OCPP 1.6
        return [3, uniqueId, {
            currentTime: new Date().toISOString()
        }];
    } catch (error) {
        logger.error(`Error handling heartbeat from ${chargePointId}:`, error);
        return [3, uniqueId, {
            currentTime: new Date().toISOString()
        }];
    }
}

module.exports = handleHeartbeat;
