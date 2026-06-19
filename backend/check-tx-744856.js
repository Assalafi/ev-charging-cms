require('dotenv').config();
const { Transaction } = require('./src/models');

async function check() {
  try {
    const tx = await Transaction.findOne({
      where: { transactionId: 744856 },
      raw: true
    });

    if (!tx) {
      console.log('Transaction 744856 not found');
    } else {
      console.log('Transaction 744856:', {
        transactionId: tx.transactionId,
        status: tx.status,
        amount: tx.amount,
        energyDelivered: tx.energyDelivered,
        idTag: tx.idTag,
        chargePointId: tx.chargePointId,
        startTime: tx.startTime,
        stopTime: tx.stopTime,
        billedAt: tx.billedAt
      });
    }

    // Check if there's a transaction with this reference pattern
    const { PaymentTransaction } = require('./src/models');
    const payments = await PaymentTransaction.findAll({
      where: { reference: { $like: '%744856%' } },
      order: [['createdAt', 'ASC']],
      raw: true
    });

    console.log(`\nFound ${payments.length} payments for transaction 744856:`);
    payments.forEach(p => {
      console.log(`${p.id} ${p.type} ₦${p.amount} ${p.reference} ${p.createdAt}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
