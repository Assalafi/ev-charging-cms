require('dotenv').config();
const { Transaction, MobileUser, Wallet, ChargingStation, Location, sequelize } = require('./src/models');

async function checkAutoStop() {
  try {
    // Check active transactions
    const active = await Transaction.findAll({
      where: { status: 'InProgress' },
      attributes: ['transactionId', 'chargePointId', 'idTag', 'startTime', 'amount', 'energyDelivered', 'startMeterValue'],
      raw: true
    });
    console.log('=== ACTIVE TRANSACTIONS ===');
    console.log(JSON.stringify(active, null, 2));

    // For each active transaction, check wallet balance vs cost
    for (const tx of active) {
      if (tx.idTag) {
        const user = await MobileUser.findOne({ where: { tagId: tx.idTag }, raw: true });
        if (user) {
          const wallet = await Wallet.findOne({ where: { userId: user.id }, raw: true });
          console.log(`\nTX ${tx.transactionId} | User: ${user.phone} | Energy: ${tx.energyDelivered} | Amount: ${tx.amount} | Wallet: ${wallet ? wallet.balance : 'NO WALLET'}`);
          if (wallet && parseFloat(tx.amount) >= parseFloat(wallet.balance)) {
            console.log(`  >>> SHOULD AUTO-STOP! Cost ₦${tx.amount} >= Balance ₦${wallet.balance}`);
          }
        }
      }
    }

    // Check last 5 completed transactions to see meter value patterns
    const recent = await Transaction.findAll({
      where: { status: 'Completed' },
      order: [['stopTime', 'DESC']],
      limit: 5,
      attributes: ['transactionId', 'chargePointId', 'idTag', 'startTime', 'stopTime', 'startMeterValue', 'stopMeterValue', 'energyDelivered', 'amount'],
      raw: true
    });
    console.log('\n=== LAST 5 COMPLETED TRANSACTIONS ===');
    console.log(JSON.stringify(recent, null, 2));

    // Check MeterValueSampleInterval config
    const station = await ChargingStation.findOne({ raw: true });
    console.log('\n=== FIRST STATION ===');
    console.log(JSON.stringify(station, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkAutoStop();
