const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  database: 'ev_charging_prod',
  username: 'assalafi',
  password: 'Assalafi@139',
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: console.log
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    const [results] = await sequelize.query('SELECT 1 as test');
    console.log('Test query results:', results);
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

testConnection();
