const logger = require('../../utils/logger');
const { sequelize } = require('../../models');
const tagAuthService = require('../../services/tagAuthorization');

/**
 * Handle ReserveNow command according to OCPP 1.6 specification
 * 
 * @param {object} ws - WebSocket connection
 * @param {Array} message - OCPP message
 * @returns {Array} OCPP response message
 */
async function handleReserveNow(ws, message) {
    const [messageType, messageId, action, payload] = message;
    const stationId = ws.stationId;
    
    logger.info(`Processing ReserveNow for ${stationId}: ${JSON.stringify(payload)}`);
    
    // Validate payload according to OCPP 1.6 spec
    if (!payload || !payload.connectorId || !payload.idTag || !payload.expiryDate) {
        logger.warn(`Invalid ReserveNow payload from Central System to ${stationId}`);
        return [3, messageId, {
            status: 'Rejected',
            errorCode: 'FormationViolation'
        }];
    }
    
    try {
        const { connectorId, idTag, expiryDate, parentIdTag, reservationId } = payload;
        
        // Verify tag is authorized
        const authResult = await tagAuthService.isAuthorized(idTag);
        if (authResult.status !== 'Accepted') {
            logger.warn(`Tag ${idTag} not authorized for reservation on ${stationId}`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'AuthorizationRejected'
            }];
        }
        
        // Check if connector exists and is available
        const [connector] = await sequelize.query(
            `SELECT * FROM connectors WHERE "chargePointId" = $1 AND "connectorId" = $2`,
            {
                bind: [stationId, connectorId],
                type: sequelize.QueryTypes.SELECT
            }
        );
        
        if (!connector) {
            logger.warn(`Connector ${connectorId} not found for station ${stationId}`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'UnknownConnector'
            }];
        }
        
        if (connector.status !== 'Available') {
            logger.warn(`Connector ${connectorId} not available (${connector.status}) for reservation`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'ConnectorUnavailable'
            }];
        }
        
        // Check for existing reservation on this connector
        const [existingReservation] = await sequelize.query(
            `SELECT * FROM reservations 
             WHERE "chargePointId" = $1 AND "connectorId" = $2 
             AND "expiryDate" > NOW() AND status = 'Accepted'`,
            {
                bind: [stationId, connectorId],
                type: sequelize.QueryTypes.SELECT
            }
        );
        
        if (existingReservation) {
            logger.warn(`Connector ${connectorId} already has reservation ${existingReservation.reservationId}`);
            return [3, messageId, {
                status: 'Rejected',
                errorCode: 'Occupied'
            }];
        }
        
        // Generate reservation ID if not provided
        const finalReservationId = reservationId || Math.floor(Math.random() * 1000000) + 1;
        
        // Create reservation
        await sequelize.query(
            `INSERT INTO reservations 
             ("reservationId", "chargePointId", "connectorId", "idTag", "expiryDate", status, "createdAt", "updatedAt") 
             VALUES ($1, $2, $3, $4, $5, 'Accepted', NOW(), NOW())`,
            {
                bind: [
                    finalReservationId,
                    stationId,
                    connectorId,
                    idTag,
                    new Date(expiryDate)
                ],
                type: sequelize.QueryTypes.INSERT
            }
        );
        
        // Update connector status
        await sequelize.query(
            `UPDATE connectors 
             SET status = 'Reserved', "updatedAt" = NOW() 
             WHERE "chargePointId" = $1 AND "connectorId" = $2`,
            {
                bind: [stationId, connectorId],
                type: sequelize.QueryTypes.UPDATE
            }
        );
        
        logger.info(`Reservation ${finalReservationId} created for ${stationId}-${connectorId} until ${expiryDate}`);
        
        // Return accepted response
        return [3, messageId, {
            status: 'Accepted'
        }];
    } catch (error) {
        logger.error(`Error handling ReserveNow for ${stationId}:`, error);
        return [3, messageId, {
            status: 'Rejected',
            errorCode: 'InternalError'
        }];
    }
}

module.exports = handleReserveNow;
