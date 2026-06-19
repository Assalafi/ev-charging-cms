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

async function setupReservations() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Create reservations table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        "reservationId" INTEGER UNIQUE NOT NULL,
        "chargePointId" VARCHAR(255) NOT NULL,
        "connectorId" INTEGER NOT NULL,
        "idTag" VARCHAR(255) NOT NULL,
        "expiryDate" TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'Accepted',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_charging_station_reservation
          FOREIGN KEY("chargePointId") 
          REFERENCES charging_stations("chargePointId")
          ON DELETE CASCADE
      );
    `);
    console.log('Reservations table created or already exists');
    
    // Add indexes for better performance
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations ("expiryDate");
      CREATE INDEX IF NOT EXISTS idx_reservations_connector ON reservations ("chargePointId", "connectorId");
      CREATE INDEX IF NOT EXISTS idx_reservations_tag ON reservations ("idTag");
    `);
    
    console.log('Reservation initialization completed successfully');
  } catch (error) {
    console.error('Error setting up reservations:', error);
  } finally {
    await sequelize.close();
  }
}

setupReservations();
