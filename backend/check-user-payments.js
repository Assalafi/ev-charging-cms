require('dotenv').config();
const { PaymentTransaction, MobileUser, Wallet, Transaction } = require('./src/models');

async function check() {
  try {
    const { Op } = require('sequelize');
    const user = await MobileUser.findOne({
      where: {
        [Op.or]: [
          { phone: 'MOB8076294575' },
          { email: 'MOB8076294575' },
          { tagId: 'MOB8076294575' },
          { name: { [Op.like]: '%Edet%' } }
        ]
      }
    });

    if (!user) {
      console.log('User not found');
      process.exit(0);
    }

    const wallet = await Wallet.findOne({ where: { userId: user.id } });

    if (!wallet) {
      console.log('Wallet not found');
      process.exit(0);
    }

    console.log(`User: ${user.phone} (${user.email})`);
    console.log(`Wallet Balance: ₦${parseFloat(wallet.balance).toFixed(2)}`);

    const payments = await PaymentTransaction.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']],
      limit: 25,
      raw: true
    });

    console.log(`\nLast 25 payment transactions:`);
    let totalCredits = 0;
    let totalDebits = 0;

    payments.forEach(p => {
      const type = p.type === 'CREDIT' ? '+' : '-';
      const amount = parseFloat(p.amount);
      if (p.type === 'CREDIT') totalCredits += amount;
      else totalDebits += amount;

      console.log(`${p.id} ${type} ₦${amount.toFixed(2)} ${p.type} ${p.reference} ${p.createdAt}`);
    });

    console.log(`\nTotal Credits: ₦${totalCredits.toFixed(2)}`);
    console.log(`Total Debits: ₦${totalDebits.toFixed(2)}`);
    console.log(`Net: ₦${(totalCredits - totalDebits).toFixed(2)}`);

    // Check transactions for this user
    const transactions = await Transaction.findAll({
      where: { idTag: user.tagId },
      order: [['transactionId', 'DESC']],
      limit: 10,
      raw: true
    });

    console.log(`\nLast 10 charging transactions:`);
    transactions.forEach(t => {
      console.log(`TX ${t.transactionId}: ₦${t.amount} ${t.status} ${t.startTime} - ${t.stopTime}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
