require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_firmware_updates');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Firmware update tracking schema is ready. Existing records were preserved.');
  } catch (error) {
    console.error('Firmware update tracking migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
