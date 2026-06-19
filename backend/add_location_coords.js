const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config({ path: '.env' });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT,
    logging: false,
  }
);

async function addLocationCoords() {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Add latitude column
    try {
      await sequelize.query(`
        ALTER TABLE locations 
        ADD COLUMN IF NOT EXISTS latitude REAL
      `);
      console.log('✓ Added latitude column');
    } catch (e) {
      console.log('latitude column may already exist:', e.message);
    }

    // Add longitude column
    try {
      await sequelize.query(`
        ALTER TABLE locations 
        ADD COLUMN IF NOT EXISTS longitude REAL
      `);
      console.log('✓ Added longitude column');
    } catch (e) {
      console.log('longitude column may already exist:', e.message);
    }

    await sequelize.close();
    console.log('Done');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addLocationCoords();
