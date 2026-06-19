require('dotenv').config();
const { Transaction, MobileUser, Wallet } = require('./src/models');

async function check() {
  try {
    const active = await Transaction.findAll({
      where: { status: 'InProgress' },
      attributes: ['transactionId', 'chargePointId', 'idTag', 'startTime', 'amount', 'energyDelivered'],
      raw: true
    });
    console.log('Active sessions:', active.length);

    for (const tx of active) {
      const user = await MobileUser.findOne({ where: { tagId: tx.idTag }, raw: true });
      if (user) {
        const wallet = await Wallet.findOne({ where: { userId: user.id }, raw: true });
        console.log(`TX ${tx.transactionId}: Amount ₦${tx.amount}, Wallet ₦${wallet?.balance}, User ${user.phone || user.email}`);
        if (parseFloat(tx.amount) >= parseFloat(wallet?.balance)) {
          console.log(`  >>> SHOULD STOP!`);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
