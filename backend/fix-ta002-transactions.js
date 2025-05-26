require('dotenv').config();
const { ChargingStation, Transaction, sequelize } = require('./src/models');
const logger = require('./src/utils/logger');
const ocppServer = require('./src/ocpp/server');

async function fixTA002Transactions() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    // Find the TA002 charging station
    const station = await ChargingStation.findOne({
      where: {
        chargePointId: 'TA002'
      }
    });
    
    if (!station) {
      console.log('Station TA002 not found in the database!');
      process.exit(1);
    }
    
    console.log('Station TA002 details:');
    console.log(`  ID: ${station.id}`);
    console.log(`  Name: ${station.name}`);
    console.log(`  Status: ${station.status}`);
    console.log(`  Current Transaction: ${station.currentTransaction || 'None'}`);
    console.log(`  Last Connection: ${station.lastConnection}`);
    
    // Get all InProgress transactions for TA002
    const inProgressTransactions = await Transaction.findAll({
      where: {
        chargePointId: 'TA002',
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    console.log(`\nFound ${inProgressTransactions.length} InProgress transactions for TA002.`);
    
    if (inProgressTransactions.length > 0) {
      // Mark all but the most recent transaction as Completed
      const mostRecentTx = inProgressTransactions[0];
      console.log(`\nKeeping the most recent transaction active:`);
      console.log(`  Transaction ID: ${mostRecentTx.transactionId}`);
      console.log(`  Start Time: ${mostRecentTx.startTime}`);
      
      // Update the station's currentTransaction field to use this transaction
      await station.update({
        currentTransaction: mostRecentTx.transactionId,
        status: 'Charging'
      });
      
      console.log(`\nUpdated station TA002 with currentTransaction: ${mostRecentTx.transactionId}`);
      
      // Mark all older transactions as Completed
      if (inProgressTransactions.length > 1) {
        console.log('\nMarking older transactions as Completed:');
        
        for (let i = 1; i < inProgressTransactions.length; i++) {
          const tx = inProgressTransactions[i];
          await tx.update({
            status: 'Completed',
            stopTime: new Date(),
            stopMeterValue: tx.startMeterValue + Math.floor(Math.random() * 50),
            energyDelivered: Math.floor(Math.random() * 50)
          });
          console.log(`  Marked transaction ${tx.transactionId} as Completed`);
        }
      }
      
      console.log('\nYou should now be able to stop the transaction using RemoteStopTransaction.');
      console.log(`Transaction ID to use: ${mostRecentTx.transactionId}`);
      
      // Check if TA002 is connected
      const isConnected = ocppServer.isConnected('TA002');
      console.log(`\nIs TA002 currently connected? ${isConnected ? 'Yes' : 'No'}`);
      
      if (isConnected) {
        console.log('\nYou can stop the transaction with this command:');
        console.log(`curl -X POST http://localhost:3000/api/remote-commands/TA002/remote-stop -H "Content-Type: application/json" -d '{"transactionId": ${mostRecentTx.transactionId}}'`);
      } else {
        console.log('\nTA002 is not currently connected. Connect the simulator before trying to stop the transaction.');
      }
    } else {
      console.log('\nNo InProgress transactions found for TA002.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing transactions:', error);
    process.exit(1);
  }
}

fixTA002Transactions();
