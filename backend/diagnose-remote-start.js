/**
 * Diagnostic script to test RemoteStartTransaction functionality
 * This script will send a RemoteStartTransaction request to a specified charging station
 */
require('dotenv').config();
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');
const { Transaction, ChargingStation, Connector } = require('./src/models');

// Station ID to test (modify as needed)
const STATION_ID = 'T001';
const CONNECTOR_ID = 1;
const ID_TAG = 'TAG001';

async function run() {
  logger.info('==== OCPP RemoteStartTransaction Diagnostic Test ====');
  
  try {
    // 1. Check if station is connected
    const isConnected = ocppServer.isConnected(STATION_ID);
    logger.info(`Station ${STATION_ID} connection status: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    
    if (!isConnected) {
      logger.error('Cannot proceed with test - station is not connected');
      return;
    }
    
    // 2. Check for existing transactions
    const activeTransactions = await Transaction.findAll({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID,
        status: 'InProgress'
      }
    });
    
    logger.info(`Found ${activeTransactions.length} active transactions on connector ${CONNECTOR_ID}`);
    
    if (activeTransactions.length > 0) {
      logger.warn('Active transactions exist, which may prevent a new transaction:');
      activeTransactions.forEach(tx => {
        logger.info(`  Transaction ID: ${tx.transactionId}, Started: ${tx.startTime}`);
      });
    }
    
    // 3. Check connector status
    let connector = await Connector.findOne({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID
      }
    });
    
    if (!connector) {
      logger.info(`Connector ${CONNECTOR_ID} not found, creating it`);
      connector = await Connector.create({
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID,
        status: 'Available'
      });
    }
    
    logger.info(`Connector ${CONNECTOR_ID} status: ${connector.status}`);
    
    if (connector.status !== 'Available') {
      logger.warn(`Connector is not Available (${connector.status}), which may prevent a new transaction`);
    }
    
    // 4. Send RemoteStartTransaction request
    logger.info(`Sending RemoteStartTransaction to station ${STATION_ID}...`);
    
    const response = await ocppServer.sendOcppRequest(STATION_ID, 'RemoteStartTransaction', {
      idTag: ID_TAG,
      connectorId: CONNECTOR_ID
    });
    
    logger.info(`RemoteStartTransaction response: ${JSON.stringify(response)}`);
    
    if (response.success) {
      logger.info(`Successfully sent RemoteStartTransaction request with messageId: ${response.messageId}`);
      logger.info('Check server logs for the station response');
    } else {
      logger.error(`Failed to send RemoteStartTransaction: ${response.error}`);
    }
    
    // Wait for response
    logger.info('Waiting 5 seconds for transaction to start...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 5. Check if transaction was created
    const newTransactions = await Transaction.findAll({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID,
        status: ['InProgress', 'Pending'],
        startTime: {
          [require('sequelize').Op.gt]: new Date(Date.now() - 30000) // Last 30 seconds
        }
      },
      order: [['startTime', 'DESC']]
    });
    
    if (newTransactions.length > 0) {
      logger.info(`Success! New transaction created: ${JSON.stringify(newTransactions[0].get())}`);
    } else {
      logger.error('No new transaction was created in the last 30 seconds');
      logger.info('Potential issues:');
      logger.info('1. Station rejected the RemoteStartTransaction request');
      logger.info('2. Station did not follow up with a StartTransaction request');
      logger.info('3. Database failed to record the transaction');
    }
    
    logger.info('==== Diagnostic Test Complete ====');
  } catch (error) {
    logger.error('Error running diagnostic:', error);
  }
}

// Run the diagnostic
run().catch(err => {
  logger.error('Fatal error running diagnostic:', err);
  process.exit(1);
});
