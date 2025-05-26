require('dotenv').config();
const { ChargingStation, Transaction, sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

async function checkStationT001() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    // Find the T001 charging station
    const station = await ChargingStation.findOne({
      where: {
        chargePointId: 'T001'
      }
    });
    
    if (!station) {
      console.log('Station T001 not found in the database!');
      process.exit(1);
    }
    
    console.log('Station T001 details:');
    console.log(`  ID: ${station.id}`);
    console.log(`  Name: ${station.name}`);
    console.log(`  Status: ${station.status}`);
    console.log(`  Current Transaction: ${station.currentTransaction}`);
    console.log(`  Last Connection: ${station.lastConnection}`);
    
    // Check if there are any transactions for T001
    const transactions = await Transaction.findAll({
      where: {
        chargePointId: 'T001'
      },
      order: [['startTime', 'DESC']]
    });
    
    console.log(`\nFound ${transactions.length} transactions for T001.`);
    
    if (transactions.length > 0) {
      console.log('\nList of transactions for T001:');
      transactions.forEach((tx, index) => {
        console.log(`Transaction #${index + 1}:`);
        console.log(`  ID: ${tx.id}`);
        console.log(`  Transaction ID: ${tx.transactionId}`);
        console.log(`  Status: ${tx.status}`);
        console.log(`  Start Time: ${tx.startTime}`);
        console.log(`  Stop Time: ${tx.stopTime || 'N/A'}`);
        console.log('-----------------------------------');
      });
    } else {
      console.log('\nNo transactions found for T001. Let\'s create a test transaction.');
      
      // Generate a random transaction ID between 1 and 1000000
      const transactionId = Math.floor(Math.random() * 1000000) + 1;
      
      const newTransaction = await Transaction.create({
        transactionId,
        chargePointId: 'T001',
        connectorId: 1,
        idTag: 'TEST_TAG',
        startTime: new Date(),
        startMeterValue: 0,
        status: 'InProgress'
      });
      
      console.log(`\nCreated test transaction for T001 with ID: ${transactionId}`);
      
      // Update the station's currentTransaction field
      await station.update({
        currentTransaction: transactionId,
        status: 'Charging'
      });
      
      console.log(`Updated station T001 with currentTransaction: ${transactionId}`);
      console.log('\nYou should now be able to stop this transaction using RemoteStopTransaction.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking station:', error);
    process.exit(1);
  }
}

checkStationT001();
