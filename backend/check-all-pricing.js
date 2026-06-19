/**
 * Check all pricing settings
 */
require('dotenv').config();
const { sequelize, Settings } = require('./src/models');

async function checkAllPricing() {
  try {
    const allSettings = await Settings.findAll({
      where: { category: 'pricing' }
    });

    console.log('All pricing settings:');
    allSettings.forEach(s => {
      console.log(`${s.key}:`, s.value?.data);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkAllPricing().then(() => process.exit(0));
