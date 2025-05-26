require('dotenv').config();
const { Sequelize } = require('sequelize');

// Database connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: false
  }
);

// Configuration
const TRANSACTION_ID = 230234;
const STATION_ID = 'TA002';

async function forceCompleteTransaction() {
  try {
    console.log(`Checking transaction ${TRANSACTION_ID} on station ${STATION_ID}...`);
    
    // Verify transaction exists
    const transactions = await sequelize.query(
      `SELECT * FROM transactions WHERE "transactionId" = $1 AND "chargePointId" = $2`,
      {
        bind: [TRANSACTION_ID, STATION_ID],
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (transactions.length === 0) {
      console.error(`Transaction ${TRANSACTION_ID} not found for station ${STATION_ID}`);
      return;
    }
    
    const transaction = transactions[0];
    console.log(`Found transaction: ID=${transaction.transactionId}, Status=${transaction.status}`);
    console.log(`Started: ${transaction.startTime}, ConnectorId: ${transaction.connectorId}`);
    
    if (transaction.status === 'Completed') {
      console.log(`✅ Transaction is already completed`);
      return;
    }
    
    console.log(`\nForce completing transaction in database...`);
    
    // Update transaction status to Completed
    await sequelize.query(
      `UPDATE transactions 
       SET status = 'Completed', "stopTime" = NOW() 
       WHERE "transactionId" = $1`,
      {
        bind: [TRANSACTION_ID],
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    console.log(`✅ Transaction ${TRANSACTION_ID} status updated to Completed`);
    
    // Log the force completion in ocpp_messages table
    try {
      await sequelize.query(
        `INSERT INTO ocpp_messages 
         ("chargePointId", message_type, status, payload, "timestamp", "messageId", direction)
         VALUES 
         ($1, $2, $3, $4, NOW(), $5, $6)`,
        {
          bind: [
            STATION_ID, 
            'StopTransaction', 
            'Sent', 
            JSON.stringify({
              reason: 'ForceCompleted',
              transactionId: TRANSACTION_ID,
              idTag: transaction.idTag,
              timestamp: new Date().toISOString()
            }),
            `force-${Date.now()}`,
            'C'  // C for Central System initiated
          ],
          type: sequelize.QueryTypes.INSERT
        }
      );
      console.log(`Logged force completion in ocpp_messages table`);
    } catch (error) {
      console.log(`Note: Could not log to ocpp_messages: ${error.message}`);
    }
    
    // Check if there are connectors to update
    try {
      const result = await sequelize.query(
        `UPDATE connectors 
         SET status = 'Available', "transactionId" = NULL
         WHERE "chargePointId" = $1 AND "connectorId" = $2
         RETURNING *`,
        {
          bind: [STATION_ID, transaction.connectorId || 1],
          type: sequelize.QueryTypes.UPDATE
        }
      );
      
      if (result[1] > 0) {
        console.log(`✅ Updated connector status to Available`);
      } else {
        console.log(`No connector record found for ${STATION_ID}-${transaction.connectorId}`);
      }
    } catch (error) {
      console.log(`Note: No connector table or error updating: ${error.message}`);
    }
    
    // Verify the change
    const updatedTransaction = await sequelize.query(
      `SELECT * FROM transactions WHERE "transactionId" = $1`,
      {
        bind: [TRANSACTION_ID],
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (updatedTransaction.length > 0) {
      console.log(`\nTransaction status is now: ${updatedTransaction[0].status}`);
      console.log(`Stop time: ${updatedTransaction[0].stopTime}`);
    }
    
    console.log(`\n✅ Force completion successful. The transaction has been marked as completed in the database.`);
    console.log(`Note: This does not send a real StopTransaction command to the charging station.`);
    console.log(`The charging station may still show the transaction as active until it receives a proper command.`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

forceCompleteTransaction();
