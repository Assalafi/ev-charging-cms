/**
 * Check the state of transactions and connectors in the database
 * Use this to diagnose OCPP transaction flow issues
 */
require('dotenv').config();
const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

// Station ID to check
const STATION_ID = 'T001';

async function checkState() {
  try {
    logger.info('==== OCPP Transaction State Diagnostic ====');
    
    // Check active transactions
    const transactions = await sequelize.query(`
      SELECT * FROM transactions 
      WHERE "chargePointId" = ? 
      ORDER BY "startTime" DESC 
      LIMIT 5
    `, {
      replacements: [STATION_ID],
      type: sequelize.QueryTypes.SELECT
    });
    
    logger.info(`Found ${transactions.length} recent transactions for ${STATION_ID}:`);
    
    transactions.forEach(tx => {
      logger.info(`Transaction ID: ${tx.transactionId}`);
      logger.info(`  Status: ${tx.status}`);
      logger.info(`  Connector: ${tx.connectorId}`);
      logger.info(`  ID Tag: ${tx.idTag}`);
      logger.info(`  Start Time: ${tx.startTime}`);
      logger.info(`  Stop Time: ${tx.stopTime || 'Still active'}`);
      logger.info(`  Meter Start: ${tx.startMeterValue}`);
      logger.info(`  Meter Stop: ${tx.stopMeterValue || 'N/A'}`);
      logger.info('------------------------');
    });
    
    // Check connector states
    const connectors = await sequelize.query(`
      SELECT * FROM connectors 
      WHERE "chargePointId" = ?
    `, {
      replacements: [STATION_ID],
      type: sequelize.QueryTypes.SELECT
    });
    
    logger.info(`Found ${connectors.length} connectors for ${STATION_ID}:`);
    
    connectors.forEach(conn => {
      logger.info(`Connector ID: ${conn.connectorId}`);
      logger.info(`  Status: ${conn.status}`);
      logger.info(`  Transaction ID: ${conn.transactionId || 'None'}`);
      logger.info(`  Last Update: ${conn.lastStatusUpdate}`);
      logger.info('------------------------');
    });
    
    // Check for active OCPP sessions
    const sessions = await sequelize.query(`
      SELECT COUNT(*) as count FROM ocpp_messages
      WHERE "chargePointId" = ? AND "timestamp" > NOW() - INTERVAL '1 hour'
    `, {
      replacements: [STATION_ID],
      type: sequelize.QueryTypes.SELECT
    });
    
    logger.info(`OCPP messages in the last hour: ${sessions[0]?.count || 0}`);
    
    // Check most recent messages
    const messages = await sequelize.query(`
      SELECT * FROM ocpp_messages
      WHERE "chargePointId" = ?
      ORDER BY "timestamp" DESC
      LIMIT 5
    `, {
      replacements: [STATION_ID],
      type: sequelize.QueryTypes.SELECT
    });
    
    logger.info('Most recent OCPP messages:');
    messages.forEach(msg => {
      logger.info(`${msg.timestamp} | ${msg.message_type} | ${msg.status} | ${msg.direction}`);
    });
    
    logger.info('==== End of Diagnostic ====');
  } catch (error) {
    logger.error('Error checking state:', error);
  }
}

// Run the check
checkState().catch(console.error);
