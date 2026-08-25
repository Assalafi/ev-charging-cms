require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/preserve_station_history_on_delete');

async function migrate() {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Station history migration completed successfully');
  } catch (error) {
    console.error('Station history migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
