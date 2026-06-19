/**
 * Script to add test transactions to the database
 * Run with: node scripts/add-test-transactions.js
 */
const { sequelize, Transaction, ChargingStation } = require('../backend/src/models');
const logger = require('../backend/src/utils/logger');

async function addTestTransactions() {
  try {
    logger.info('Starting test transaction creation...');
    
    // Get existing stations
    const stations = await ChargingStation.findAll();
    if (stations.length === 0) {
      logger.error('No charging stations found. Please add stations first.');
      return;
    }
    
    logger.info(`Found ${stations.length} stations to use for test transactions`);
    
    // Sample transaction data - using Nigerian context
    const transactions = [
      {
        transactionId: 100001,
        chargingStationId: stations[0].id,
        chargePointId: stations[0].chargePointId,
        connectorId: 1,
        idTag: 'NG-LAGOS-001',
        startTime: new Date(Date.now() - 3600000 * 24), // 24 hours ago
        stopTime: new Date(Date.now() - 3600000 * 23), // 23 hours ago
        startMeterValue: 0,
        stopMeterValue: 35.5,
        energyDelivered: 35.5,
        status: 'Completed'
      },
      {
        transactionId: 100002,
        chargingStationId: stations[1] ? stations[1].id : stations[0].id,
        chargePointId: stations[1] ? stations[1].chargePointId : stations[0].chargePointId,
        connectorId: 1,
        idTag: 'NG-ABUJA-002',
        startTime: new Date(Date.now() - 3600000 * 12), // 12 hours ago
        stopTime: new Date(Date.now() - 3600000 * 11), // 11 hours ago
        startMeterValue: 0,
        stopMeterValue: 22.3,
        energyDelivered: 22.3,
        status: 'Completed'
      },
      {
        transactionId: 100003,
        chargingStationId: stations[2] ? stations[2].id : stations[0].id,
        chargePointId: stations[2] ? stations[2].chargePointId : stations[0].chargePointId,
        connectorId: 1,
        idTag: 'NG-LAGOS-003',
        startTime: new Date(), // Now
        stopTime: null,
        startMeterValue: 0,
        stopMeterValue: null,
        energyDelivered: 8.7, // In progress
        status: 'InProgress'
      }
    ];
    
    // Add transactions
    for (const tx of transactions) {
      await Transaction.create(tx);
      logger.info(`Created transaction ${tx.transactionId} for station ${tx.chargePointId}`);
    }
    
    logger.info('Test transactions created successfully!');
    
  } catch (error) {
    logger.error('Error creating test transactions:', error);
  } finally {
    await sequelize.close();
  }
}

// Run the function
addTestTransactions();
