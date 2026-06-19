require('dotenv').config();
const { Transaction } = require('./src/models');

async function check() {
  try {
    // Monitor a transaction for 30 seconds to see if amount updates
    const tx = await Transaction.findOne({
      where: { status: 'InProgress' },
      attributes: ['transactionId', 'amount', 'energyDelivered', 'updatedAt']
    });

    if (!tx) {
      console.log('No active transaction');
      process.exit(0);
    }

    console.log(`Monitoring TX ${tx.transactionId} for 30 seconds...`);
    console.log(`Initial: Amount ₦${tx.amount}, Energy ${tx.energyDelivered} Wh`);

    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const fresh = await Transaction.findByPk(tx.transactionId, {
        attributes: ['transactionId', 'amount', 'energyDelivered', 'updatedAt']
      });
      console.log(`[${i*5}s] Amount ₦${fresh.amount}, Energy ${fresh.energyDelivered} Wh, Updated: ${fresh.updatedAt}`);
    }

    console.log('Done monitoring');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
