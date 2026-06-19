/**
 * Check location table for pricing
 */
require('dotenv').config();
const { sequelize, Location } = require('./src/models');

async function checkLocationTable() {
  try {
    const location = await Location.findByPk(37);

    if (!location) {
      console.log('Location 37 not found');
      return;
    }

    console.log('Location ID:', location.id);
    console.log('Name:', location.name);
    console.log('Price per Wh:', location.pricePerWh);
    console.log('Price per kWh:', location.pricePerWh * 1000);
    console.log('Minimum charge:', location.minimumCharge);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkLocationTable().then(() => process.exit(0));
