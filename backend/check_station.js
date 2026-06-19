const {sequelize} = require('./src/config/database');
const {ChargingStation} = require('./src/models');

(async () => {
  try {
    const station = await ChargingStation.findOne({ where: { chargePointId: '6371751628080034' } });
    if (station) {
      console.log('lastHeartbeat:', station.lastHeartbeat);
      console.log('status:', station.status);
      const timeSinceHeartbeat = Date.now() - new Date(station.lastHeartbeat).getTime();
      console.log('Time since heartbeat (ms):', timeSinceHeartbeat);
      console.log('Time since heartbeat (minutes):', timeSinceHeartbeat / 60000);
    } else {
      console.log('Station not found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
})();
