/**
 * Manual script to stop a transaction
 * Use this if the RemoteStopTransaction handler is not working
 */
require('dotenv').config();
const { sequelize, Transaction, Connector } = require('./src/models');
const logger = require('./src/utils/logger');

// Configuration - change these values as needed
const TRANSACTION_ID = 807711; // Use the transaction ID from your diagnostic output
const STATION_ID = 'T001';
const CONNECTOR_ID = 1;
const STOP_REASON = 'Remote'; // Valid values: 'Local', 'Remote', 'SoftReset', 'HardReset', 'Reboot', 'PowerLoss', 'EVDisconnected'

async function stopTransaction() {
  try {
    logger.info(`Attempting to stop transaction ${TRANSACTION_ID}...`);
    
    // Find the transaction
    const transaction = await Transaction.findOne({
      where: { transactionId: TRANSACTION_ID }
    });
    
    if (!transaction) {
      logger.error(`Transaction ${TRANSACTION_ID} not found`);
      return;
    }
    
    logger.info(`Found transaction: ${JSON.stringify(transaction.get())}`);
    
    // Update transaction status
    await transaction.update({
      status: 'Completed',
      stopTime: new Date(),
      stopReason: STOP_REASON
    });
    
    logger.info(`Transaction ${TRANSACTION_ID} marked as Completed`);
    
    // Find the connector
    const connector = await Connector.findOne({
      where: {
        chargePointId: STATION_ID,
        connectorId: CONNECTOR_ID
      }
    });
    
    if (connector) {
      // Update connector status
      await connector.update({
        status: 'Available',
        transactionId: null,
        lastStatusUpdate: new Date()
      });
      
      logger.info(`Connector ${CONNECTOR_ID} set to Available`);
    } else {
      logger.warn(`Connector ${CONNECTOR_ID} not found, skipping connector update`);
    }
    
    // Insert OCPP message record
    await sequelize.query(`
      INSERT INTO ocpp_messages (
        "messageId", "chargePointId", "message_type", "status", "timestamp", "payload", "direction", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
    `, {
      bind: [
        `manual-stop-${Date.now()}`,
        STATION_ID,
        'StopTransaction',
        'Received',
        new Date(),
        JSON.stringify({
          transactionId: TRANSACTION_ID,
          meterStop: transaction.startMeterValue || 0,
          timestamp: new Date().toISOString(),
          reason: STOP_REASON
        }),
        'inbound',
        new Date(),
        new Date()
      ]
    });
    
    logger.info('OCPP message record created');
    logger.info('Transaction stopped successfully!');
    
    return {
      success: true,
      transactionId: TRANSACTION_ID,
      station: STATION_ID,
      connector: CONNECTOR_ID
    };
  } catch (error) {
    logger.error('Error stopping transaction:', error);
    throw error;
  }
}

// Run the function
stopTransaction()
  .then(result => {
    if (result) {
      logger.info(`Transaction ${result.transactionId} successfully stopped`);
    }
    process.exit(0);
  })
  .catch(error => {
    logger.error('Failed to stop transaction:', error);
    process.exit(1);
  });
