/**
 * Transaction Fix Tool
 * 
 * This tool helps diagnose and fix transaction state issues
 */

require('dotenv').config();
const { ChargingStation, Transaction, Connector, sequelize } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

async function listTransactions(status = null) {
  try {
    const whereClause = status ? { status } : {};
    
    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['startTime', 'DESC']],
      limit: 20
    });
    
    logger.info(`Found ${transactions.length} transactions${status ? ` with status '${status}'` : ''}`);
    
    transactions.forEach(tx => {
      logger.info(`Transaction #${tx.transactionId} (${tx.status})`);
      logger.info(`  Station: ${tx.chargePointId}, Connector: ${tx.connectorId}`);
      logger.info(`  Start: ${tx.startTime}, Stop: ${tx.stopTime || 'N/A'}`);
      logger.info(`  Tag: ${tx.idTag}`);
      logger.info(`  Energy: ${tx.energyDelivered || 0} kWh`);
      logger.info('---------------------------------');
    });
    
    return transactions;
  } catch (error) {
    logger.error('Error listing transactions:', error);
    throw error;
  }
}

async function fixTransactionStatus(transactionId, newStatus) {
  try {
    logger.info(`Fixing transaction #${transactionId} to status '${newStatus}'`);
    
    // Find the transaction
    const transaction = await Transaction.findOne({
      where: { transactionId }
    });
    
    if (!transaction) {
      logger.error(`Transaction #${transactionId} not found`);
      return false;
    }
    
    const oldStatus = transaction.status;
    logger.info(`Current status: ${oldStatus}`);
    
    // Fix the transaction status
    transaction.status = newStatus;
    
    // If completing a transaction, set stopTime and other values
    if (newStatus === 'Completed' && !transaction.stopTime) {
      transaction.stopTime = new Date();
      transaction.stopMeterValue = transaction.startMeterValue + 10; // Assume some energy was delivered
      transaction.energyDelivered = 10;
    }
    
    await transaction.save();
    
    logger.info(`Transaction status updated from '${oldStatus}' to '${newStatus}'`);
    
    // Also update connector status if needed
    if (newStatus === 'Completed' || newStatus === 'Stopped') {
      await fixConnectorStatus(transaction.chargePointId, transaction.connectorId, 'Available');
    } else if (newStatus === 'InProgress') {
      await fixConnectorStatus(transaction.chargePointId, transaction.connectorId, 'Charging');
    }
    
    return true;
  } catch (error) {
    logger.error(`Error fixing transaction #${transactionId}:`, error);
    return false;
  }
}

async function fixConnectorStatus(chargePointId, connectorId, newStatus) {
  try {
    logger.info(`Fixing connector status for ${chargePointId}:${connectorId} to '${newStatus}'`);
    
    // Find the connector
    const connector = await Connector.findOne({
      where: { 
        chargePointId,
        connectorId: parseInt(connectorId)
      }
    });
    
    if (!connector) {
      logger.error(`Connector ${chargePointId}:${connectorId} not found`);
      return false;
    }
    
    const oldStatus = connector.status;
    logger.info(`Current status: ${oldStatus}`);
    
    // Update the connector status
    connector.status = newStatus;
    connector.lastStatusUpdate = new Date();
    
    // Clear transaction ID if setting to Available
    if (newStatus === 'Available') {
      connector.transactionId = null;
    }
    
    await connector.save();
    
    logger.info(`Connector status updated from '${oldStatus}' to '${newStatus}'`);
    return true;
  } catch (error) {
    logger.error(`Error fixing connector status for ${chargePointId}:${connectorId}:`, error);
    return false;
  }
}

async function cleanupStuckTransactions() {
  try {
    logger.info('Looking for stuck InProgress transactions...');
    
    // Find transactions that have been InProgress for more than 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const stuckTransactions = await Transaction.findAll({
      where: {
        status: 'InProgress',
        startTime: {
          [sequelize.Op.lt]: twentyFourHoursAgo
        }
      }
    });
    
    logger.info(`Found ${stuckTransactions.length} stuck transactions`);
    
    let fixedCount = 0;
    for (const tx of stuckTransactions) {
      logger.info(`Fixing stuck transaction #${tx.transactionId} for ${tx.chargePointId}:${tx.connectorId}`);
      
      // Complete the transaction
      tx.status = 'Completed';
      tx.stopTime = new Date();
      tx.stopMeterValue = tx.startMeterValue + Math.floor(Math.random() * 100);
      tx.energyDelivered = tx.stopMeterValue - tx.startMeterValue;
      
      await tx.save();
      
      // Fix the connector status
      await fixConnectorStatus(tx.chargePointId, tx.connectorId, 'Available');
      
      fixedCount++;
    }
    
    logger.info(`Fixed ${fixedCount} stuck transactions`);
    return fixedCount;
  } catch (error) {
    logger.error('Error cleaning up stuck transactions:', error);
    return 0;
  }
}

async function createTestTransaction(chargePointId, connectorId, status = 'InProgress') {
  try {
    logger.info(`Creating test transaction for ${chargePointId}:${connectorId} with status '${status}'`);
    
    // Generate a unique transaction ID
    const transactionId = Math.floor(Math.random() * 1000000);
    
    // Create the transaction
    const transaction = await Transaction.create({
      transactionId,
      chargePointId,
      connectorId: parseInt(connectorId),
      idTag: 'TEST_TAG',
      startTime: new Date(),
      startMeterValue: 0,
      status
    });
    
    logger.info(`Created test transaction #${transaction.transactionId}`);
    
    // Update connector status if needed
    if (status === 'InProgress') {
      await fixConnectorStatus(chargePointId, connectorId, 'Charging');
    }
    
    return transaction;
  } catch (error) {
    logger.error(`Error creating test transaction for ${chargePointId}:${connectorId}:`, error);
    return null;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
      console.log(`
Usage:
  node transaction-fix.js <command> [options]

Commands:
  list [status]                  List recent transactions, optionally filtered by status
  fix <transactionId> <status>   Fix a transaction status
  connector <stationId> <connectorId> <status>  Fix a connector status
  cleanup                        Clean up stuck transactions
  create <stationId> <connectorId> [status]     Create a test transaction
      `);
      return;
    }
    
    switch (command) {
      case 'list':
        await listTransactions(args[1]);
        break;
        
      case 'fix':
        if (!args[1] || !args[2]) {
          logger.error('Transaction ID and new status are required');
          return;
        }
        await fixTransactionStatus(args[1], args[2]);
        break;
        
      case 'connector':
        if (!args[1] || !args[2] || !args[3]) {
          logger.error('Station ID, connector ID, and new status are required');
          return;
        }
        await fixConnectorStatus(args[1], parseInt(args[2]), args[3]);
        break;
        
      case 'cleanup':
        await cleanupStuckTransactions();
        break;
        
      case 'create':
        if (!args[1] || !args[2]) {
          logger.error('Station ID and connector ID are required');
          return;
        }
        await createTestTransaction(args[1], parseInt(args[2]), args[3] || 'InProgress');
        break;
        
      default:
        logger.error(`Unknown command: ${command}`);
    }
  } catch (error) {
    logger.error('Error in transaction fix tool:', error);
  } finally {
    // Close database connection
    await sequelize.close();
  }
}

// Run the main function
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
