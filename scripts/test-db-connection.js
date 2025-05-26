const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend .env file
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// Create a Sequelize instance with connection params
const sequelize = new Sequelize(
  process.env.DB_NAME || 'ev_cms_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log
  }
);

// Test the connection
async function testConnection() {
  try {
    console.log('Attempting to connect to PostgreSQL...');
    console.log(`Host: ${process.env.DB_HOST || '127.0.0.1'}`);
    console.log(`Port: ${process.env.DB_PORT || 5432}`);
    console.log(`Database: ${process.env.DB_NAME || 'ev_cms_db'}`);
    console.log(`User: ${process.env.DB_USER || 'postgres'}`);
    
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Test a simple query
    const [results] = await sequelize.query('SELECT current_database() as db, current_user as user');
    console.log('Database info:', results[0]);
    
    await sequelize.close();
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

testConnection();
