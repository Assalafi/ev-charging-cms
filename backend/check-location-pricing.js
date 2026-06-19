/**
 * Check location-based pricing for station 868660078684315
 */
require('dotenv').config();
const { sequelize, ChargingStation, Location, Settings } = require('./src/models');
const { Op } = require('sequelize');

async function checkLocationPricing() {
  try {
    // Get the station
    const station = await ChargingStation.findOne({
      where: { chargePointId: '868660078684315' }
    });

    if (!station) {
      console.log('Station not found');
      return;
    }

    console.log('Station:', station.chargePointId);
    console.log('Location ID:', station.locationId);

    // Get location
    const location = await Location.findByPk(station.locationId);
    console.log('Location:', location?.name || 'N/A');

    // Check location-specific pricing
    const locationPricing = await Settings.findAll({
      where: { 
        category: 'pricing',
        key: { [Op.like]: `${location?.id || 'default'}_%` }
      }
    });

    console.log('\nLocation-specific pricing:');
    locationPricing.forEach(s => {
      console.log(`${s.key}:`, s.value?.data);
    });

    // Check global pricing
    const globalPricing = await Settings.findAll({
      where: { 
        category: 'pricing',
        key: { [Op.like]: 'base%' }
      }
    });

    console.log('\nGlobal pricing:');
    globalPricing.forEach(s => {
      console.log(`${s.key}:`, s.value?.data);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkLocationPricing().then(() => process.exit(0));
