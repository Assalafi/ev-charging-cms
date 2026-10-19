require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_transaction_battery_soc');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Transaction battery SOC schema is ready. Existing records were preserved.');
  } catch (error) {
    console.error('Transaction battery SOC migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
