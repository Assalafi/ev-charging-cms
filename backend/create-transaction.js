/**
 * Direct database script to create a transaction record
 * This bypasses model loading issues by using direct SQL
 */
require('dotenv').config();
const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

// Configuration 
const STATION_ID = 'T001';
const CONNECTOR_ID = 1;
const ID_TAG = 'TAG001';

async function createTransaction() {
  try {
    logger.info('Creating transaction directly in database...');
    
    // Generate transaction ID
    const transactionId = Math.floor(Math.random() * 1000000) + 1;
    
    // Create transaction using direct SQL query
    const query = `
      INSERT INTO transactions 
        ("transactionId", "chargePointId", "connectorId", "idTag", "startTime", "startMeterValue", "status", "createdAt", "updatedAt") 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const now = new Date();
    
    const [transaction] = await sequelize.query(query, {
      bind: [
        transactionId,      // transactionId
        STATION_ID,         // chargePointId
        CONNECTOR_ID,       // connectorId
        ID_TAG,             // idTag
        now,                // startTime
        0,                  // startMeterValue
        'InProgress',       // status
        now,                // createdAt
        now                 // updatedAt
      ],
      type: sequelize.QueryTypes.INSERT
    });
    
    logger.info(`Transaction created with ID: ${transactionId}`);
    
    // Check if connectors table exists
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'connectors'
    `);
    
    if (tables && tables.length > 0) {
      // Create or update connector status
      const connectorQuery = `
        INSERT INTO connectors
          ("chargePointId", "connectorId", "status", "transactionId", "lastStatusUpdate", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("chargePointId", "connectorId")
        DO UPDATE SET
          status = $3,
          "transactionId" = $4,
          "lastStatusUpdate" = $5,
          "updatedAt" = $7
        RETURNING *
      `;
      
      await sequelize.query(connectorQuery, {
        bind: [
          STATION_ID,         // chargePointId
          CONNECTOR_ID,       // connectorId
          'Charging',         // status
          transactionId,      // transactionId
          now,                // lastStatusUpdate
          now,                // createdAt
          now                 // updatedAt
        ],
        type: sequelize.QueryTypes.UPSERT
      });
      
      logger.info(`Connector ${CONNECTOR_ID} updated to Charging state`);
    } else {
      logger.warn('Connectors table does not exist, skipping connector update');
    }
    
    return { transactionId, stationId: STATION_ID, connectorId: CONNECTOR_ID };
  } catch (error) {
    logger.error('Error creating transaction:', error);
    throw error;
  }
}

// Run the function
createTransaction()
  .then(result => {
    logger.info(`Success! Transaction created for station ${result.stationId}, connector ${result.connectorId}, transaction ID: ${result.transactionId}`);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Failed:', error);
    process.exit(1);
  });
