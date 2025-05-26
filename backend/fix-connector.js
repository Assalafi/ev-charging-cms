/**
 * Update connector status directly with SQL
 */
require('dotenv').config();
const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

// Configuration
const STATION_ID = 'T001';
const CONNECTOR_ID = 1;

async function updateConnector() {
  try {
    logger.info(`Updating connector ${CONNECTOR_ID} for station ${STATION_ID}...`);
    
    // Update connector with direct SQL
    const result = await sequelize.query(`
      UPDATE connectors
      SET status = 'Available', 
          "transactionId" = NULL,
          "lastStatusUpdate" = NOW(),
          "updatedAt" = NOW()
      WHERE "chargePointId" = ? AND "connectorId" = ?
      RETURNING *
    `, {
      replacements: [STATION_ID, CONNECTOR_ID],
      type: sequelize.QueryTypes.UPDATE
    });
    
    if (result && result[1] && result[1].rowCount > 0) {
      logger.info(`Successfully updated connector ${CONNECTOR_ID} to Available`);
    } else {
      logger.warn(`No connector was updated, possible it doesn't exist`);
    }
    
  } catch (error) {
    logger.error('Error updating connector:', error);
  }
}

// Run the function
updateConnector()
  .then(() => {
    logger.info('Connector update complete');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Failed:', error);
    process.exit(1);
  });
