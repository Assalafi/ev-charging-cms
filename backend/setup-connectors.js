require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: console.log
  }
);

async function setupConnectors() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Create connectors table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS connectors (
        id SERIAL PRIMARY KEY,
        "chargePointId" VARCHAR(255) NOT NULL,
        "connectorId" INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) DEFAULT 'Available',
        "errorCode" VARCHAR(50),
        info TEXT,
        "vendorId" VARCHAR(255),
        "vendorErrorCode" VARCHAR(50),
        "transactionId" INTEGER,
        "meterValue" FLOAT DEFAULT 0,
        "lastStatusUpdate" TIMESTAMP DEFAULT NOW(),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE("chargePointId", "connectorId"),
        CONSTRAINT fk_charging_station
          FOREIGN KEY("chargePointId") 
          REFERENCES charging_stations("chargePointId")
          ON DELETE CASCADE
      );
    `);
    console.log('Connectors table created or already exists');
    
    // Initialize connectors for existing charging stations
    const stations = await sequelize.query(
      `SELECT "chargePointId" FROM charging_stations`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    console.log(`Found ${stations.length} charging stations to initialize connectors for`);
    
    for (const station of stations) {
      // Create connector 0 (main connector) and connector 1 (first charging point)
      for (const connectorId of [0, 1]) {
        await sequelize.query(`
          INSERT INTO connectors ("chargePointId", "connectorId", status)
          VALUES ($1, $2, 'Available')
          ON CONFLICT ("chargePointId", "connectorId") DO NOTHING
        `, { 
          bind: [station.chargePointId, connectorId],
          type: sequelize.QueryTypes.INSERT
        });
      }
      console.log(`Initialized connectors for station ${station.chargePointId}`);
    }
    
    // Add indexes for better performance
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_connectors_status ON connectors (status);
      CREATE INDEX IF NOT EXISTS idx_connectors_transaction ON connectors ("transactionId");
    `);
    
    console.log('Connector initialization completed successfully');
  } catch (error) {
    console.error('Error setting up connectors:', error);
  } finally {
    await sequelize.close();
  }
}

setupConnectors();
