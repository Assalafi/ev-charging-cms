const sequelize = require('./src/config/database');

async function addLocationCoords() {
  try {
    await sequelize.queryInterface.addColumn('locations', 'latitude', {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true,
      comment: 'GPS latitude for navigation'
    }).catch(() => console.log('latitude column may already exist'));

    await sequelize.queryInterface.addColumn('locations', 'longitude', {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true,
      comment: 'GPS longitude for navigation'
    }).catch(() => console.log('longitude column may already exist'));

    console.log('Columns added successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addLocationCoords();
