const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: console.log
  }
);

async function resetDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Drop the problematic tables in the correct order (respect foreign key constraints)
    console.log('Dropping tables...');
    
    // Drop tables with foreign keys first
    await sequelize.query('DROP TABLE IF EXISTS ocpp_messages CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS transactions CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS meter_values CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS firmware_updates CASCADE;');
    await sequelize.query('DROP TABLE IF EXISTS diagnostic_logs CASCADE;');
    
    console.log('Tables dropped successfully. The application will recreate them on startup.');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database or drop tables:', error);
    process.exit(1);
  }
}

resetDatabase();
