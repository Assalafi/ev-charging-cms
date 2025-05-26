require('dotenv').config();
const { Transaction, sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

async function checkTransactions() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    // Find all transactions with status 'InProgress'
    const inProgressTransactions = await Transaction.findAll({
      where: {
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    console.log(`Found ${inProgressTransactions.length} transactions with 'InProgress' status.`);
    
    if (inProgressTransactions.length > 0) {
      console.log('\nList of InProgress transactions:');
      inProgressTransactions.forEach((tx, index) => {
        console.log(`Transaction #${index + 1}:`);
        console.log(`  ID: ${tx.id}`);
        console.log(`  Transaction ID: ${tx.transactionId}`);
        console.log(`  Charging Station ID: ${tx.chargePointId}`);
        console.log(`  Start Time: ${tx.startTime}`);
        console.log(`  Connector ID: ${tx.connectorId}`);
        console.log(`  ID Tag: ${tx.idTag}`);
        console.log(`  Created At: ${tx.createdAt}`);
        console.log('-----------------------------------');
      });
      
      // Suggestion to clean up transactions
      console.log('\nConsider cleaning up old transactions by running:');
      console.log('UPDATE transactions SET status = \'Completed\', stopTime = NOW() WHERE status = \'InProgress\' AND "startTime" < NOW() - INTERVAL \'1 day\';');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking transactions:', error);
    process.exit(1);
  }
}

checkTransactions();
