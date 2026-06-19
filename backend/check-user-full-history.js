require('dotenv').config();
const { PaymentTransaction, MobileUser, Wallet } = require('./src/models');

async function check() {
  try {
    const { Op } = require('sequelize');
    const user = await MobileUser.findOne({
      where: {
        [Op.or]: [
          { phone: '08076294575' },
          { email: '08076294575' },
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

    console.log(`User: ${user.phone} (${user.email})`);
    console.log(`Current Wallet Balance: ₦${parseFloat(wallet.balance).toFixed(2)}`);

    // Get ALL payment transactions for this user
    const payments = await PaymentTransaction.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'ASC']],
      raw: true
    });

    console.log(`\nTotal payment transactions: ${payments.length}`);
    console.log('\nFull payment history (oldest to newest):');

    let runningBalance = 0;
    payments.forEach(p => {
      const amount = parseFloat(p.amount);
      if (p.type === 'CREDIT') {
        runningBalance += amount;
      } else {
        runningBalance -= amount;
      }
      console.log(`${p.createdAt} ${p.type} ₦${amount.toFixed(2)} | Running: ₦${runningBalance.toFixed(2)} | Ref: ${p.reference}`);
    });

    console.log(`\nFinal calculated balance: ₦${runningBalance.toFixed(2)}`);
    console.log(`Actual DB balance: ₦${parseFloat(wallet.balance).toFixed(2)}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
