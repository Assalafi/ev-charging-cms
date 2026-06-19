require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
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
const WEBSOCKET_URL = `ws://localhost:${process.env.PORT || 3000}/ocpp/${STATION_ID}`;

async function logToDatabase(messageType, status, payload, response = null, errorCode = null, isIncoming = false) {
  try {
    await sequelize.query(
      `INSERT INTO ocpp_messages
        ("chargePointId", message_type, status, payload, "timestamp", "messageId", "errorCode", direction)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)`,
      {
        bind: [
          STATION_ID,
          messageType,
          status,
          JSON.stringify({ payload, response }),
          new Date(),
          uuidv4().substring(0, 8),
          errorCode,
          isIncoming ? 'I' : 'O'  // 'I' for incoming, 'O' for outgoing
        ],
        type: sequelize.QueryTypes.INSERT
      }
    );
    console.log(`Logged ${messageType} message to database with status: ${status}`);
  } catch (error) {
    console.error('Error logging to database:', error.message);
  }
}

async function sendRemoteStopTransaction() {
  console.log(`Attempting to stop transaction ${TRANSACTION_ID} on station ${STATION_ID}...`);
  
  // Verify transaction exists and is active
  try {
    const transaction = await sequelize.query(
      `SELECT * FROM transactions WHERE "transactionId" = $1 AND "chargePointId" = $2`,
      {
        bind: [TRANSACTION_ID, STATION_ID],
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (transaction.length === 0) {
      console.error(`Transaction ${TRANSACTION_ID} not found for station ${STATION_ID}`);
      return;
    }
    
    if (transaction[0].status !== 'InProgress') {
      console.error(`Transaction ${TRANSACTION_ID} is not in progress (status: ${transaction[0].status})`);
      return;
    }
    
    console.log(`Found active transaction: ID=${TRANSACTION_ID}, IdTag=${transaction[0].idTag}, ConnectorId=${transaction[0].connectorId}`);
  } catch (error) {
    console.error('Error verifying transaction:', error.message);
    return;
  }
  
  // Connect to WebSocket
  const ws = new WebSocket(WEBSOCKET_URL);
  
  ws.on('open', () => {
    console.log(`Connected to ${STATION_ID} via WebSocket`);
    
    // First send BootNotification to properly initialize connection
    const bootMessageId = uuidv4();
    const bootMessage = [
      2, // CALL
      bootMessageId,
      "BootNotification",
      {
        chargePointVendor: "Test Vendor",
        chargePointModel: "Test Model"
      }
    ];
    
    ws.send(JSON.stringify(bootMessage));
    console.log('Sent BootNotification to establish proper connection');
    
    // Wait before sending RemoteStopTransaction
    setTimeout(() => {
      // Send RemoteStopTransaction request
      const messageId = uuidv4();
      const message = [
        2, // CALL
        messageId,
        "RemoteStopTransaction", 
        {
          transactionId: TRANSACTION_ID
        }
      ];
      
      ws.send(JSON.stringify(message));
      console.log(`Sent RemoteStopTransaction for transaction ${TRANSACTION_ID}`);
      
      // Log outgoing message
      logToDatabase(
        'RemoteStopTransaction',
        'Sent',
        { transactionId: TRANSACTION_ID }
      );
    }, 2000);
    
    // Set timeout to close if no response
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('No response received within timeout period. Closing connection.');
        logToDatabase(
          'RemoteStopTransaction',
          'Timeout',
          { transactionId: TRANSACTION_ID },
          null,
          'Timeout'
        );
        ws.close();
      }
    }, 15000);
  });
  
  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data);
      console.log('Received response:', JSON.stringify(response, null, 2));
      
      // Log the incoming message
      logToDatabase(
        response[2] ? 'Response' : response[1],
        'Received',
        null,
        response,
        null,
        true
      );
      
      // Expected response format: [3, "<same-message-id>", {"status":"Accepted|Rejected"}]
      if (Array.isArray(response) && response[0] === 3) {
        const responseStatus = response[2]?.status;
        const errorCode = responseStatus === 'Rejected' ? (response[2]?.errorCode || 'UnknownError') : null;
        
        if (responseStatus === 'Accepted') {
          console.log(`✅ Successfully stopped transaction ${TRANSACTION_ID}`);
          
          // Update transaction status
          sequelize.query(
            `UPDATE transactions 
             SET status = 'Completed', "stopTime" = NOW() 
             WHERE "transactionId" = $1 AND "chargePointId" = $2`,
            {
              bind: [TRANSACTION_ID, STATION_ID],
              type: sequelize.QueryTypes.UPDATE
            }
          ).then(() => {
            console.log(`Updated transaction ${TRANSACTION_ID} status to Completed`);
          }).catch(err => {
            console.error('Error updating transaction:', err.message);
          });
        } else {
          console.error(`❌ Failed to stop transaction. Status: ${responseStatus}, Error: ${errorCode}`);
        }
      }
    } catch (error) {
      console.error('Error processing response:', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    logToDatabase(
      'RemoteStopTransaction',
      'Failed',
      { transactionId: TRANSACTION_ID },
      null,
      'ConnectionError'
    );
  });
  
  ws.on('close', async () => {
    console.log('WebSocket connection closed');
    
    // Check final transaction status
    try {
      const updatedTransaction = await sequelize.query(
        `SELECT * FROM transactions WHERE "transactionId" = $1`,
        {
          bind: [TRANSACTION_ID],
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (updatedTransaction.length > 0) {
        console.log(`Final transaction status: ${updatedTransaction[0].status}`);
        if (updatedTransaction[0].status === 'Completed') {
          console.log(`Transaction ${TRANSACTION_ID} successfully completed at ${updatedTransaction[0].stopTime}`);
        }
      }
      
      // Close database connection
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('Error checking final transaction status:', error.message);
      await sequelize.close();
      process.exit(1);
    }
  });
}

// Run the function
sendRemoteStopTransaction();
