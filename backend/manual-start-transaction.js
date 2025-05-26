/**
 * Manual script to create a transaction from the CMS side to simulate a RemoteStartTransaction
 * This bypasses the WebSocket connection issue and creates transaction records directly
 */
require('dotenv').config();
const { sequelize, Transaction, ChargingStation } = require('./src/models');
const logger = require('./src/utils/logger');

// Use Connector from sequelize.models instead (which was created by check-models.js)
const Connector = sequelize.models.Connector;

// Configuration 
const STATION_ID = 'T001';
const CONNECTOR_ID = 1;
const ID_TAG = 'TAG001';

async function createManualTransaction() {
  try {
    logger.info('Starting manual transaction creation process...');
    
    // 1. Find or create the charging station
    let station = await ChargingStation.findOne({
      where: { chargePointId: STATION_ID }
    });
    
    if (!station) {
      logger.info(`Creating new station record for ${STATION_ID}`);
      station = await ChargingStation.create({
        chargePointId: STATION_ID,
        status: 'Connected',
        lastConnection: new Date()
      });
    }
    
    // 2. Find or create the connector
    let connector = await Connector.findOne({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID
      }
    });
    
    if (!connector) {
      logger.info(`Creating new connector record for ${STATION_ID}-${CONNECTOR_ID}`);
      connector = await Connector.create({
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID,
        status: 'Available'
      });
    }
    
    // Check if connector is available
    if (connector.status !== 'Available') {
      logger.warn(`Connector ${CONNECTOR_ID} is not Available (${connector.status}), updating to Available`);
      await connector.update({ status: 'Available' });
    }
    
    // 3. Check for existing transactions
    const existingTransaction = await Transaction.findOne({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID,
        status: 'InProgress'
      }
    });
    
    if (existingTransaction) {
      logger.warn(`Found existing transaction ${existingTransaction.transactionId}, completing it`);
      await existingTransaction.update({
        status: 'Completed',
        stopTime: new Date()
      });
    }
    
    // 4. Create a new transaction
    const transactionId = Math.floor(Math.random() * 1000000) + 1;
    
    const transaction = await Transaction.create({
      transactionId,
      chargePointId: STATION_ID,
      connectorId: CONNECTOR_ID,
      idTag: ID_TAG,
      startTime: new Date(),
      startMeterValue: 0,
      status: 'InProgress'
    });
    
    logger.info(`Successfully created transaction ${transaction.transactionId}`);
    
    // 5. Update connector status
    await connector.update({
      status: 'Charging',
      transactionId: transaction.transactionId
    });
    
    logger.info(`Updated connector ${CONNECTOR_ID} status to Charging`);
    logger.info('Transaction creation successful!');
    
    // Return the transaction for further use
    return transaction;
  } catch (error) {
    logger.error('Error creating manual transaction:', error);
    throw error;
  }
}

// Run the function
createManualTransaction()
  .then(transaction => {
    logger.info(`Transaction created: ${JSON.stringify(transaction.get())}`);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Failed to create transaction:', error);
    process.exit(1);
  });
