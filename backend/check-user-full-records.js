require('dotenv').config();
const { PaymentTransaction, MobileUser, Wallet, Transaction } = require('./src/models');

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

    console.log(`=== USER INFO ===`);
    console.log(`User: ${user.phone} (${user.email})`);
    console.log(`Tag ID: ${user.tagId}`);
    console.log(`Current Wallet Balance: ₦${parseFloat(wallet.balance).toFixed(2)}`);

    // Get ALL charging transactions
    const transactions = await Transaction.findAll({
      where: { idTag: user.tagId },
      order: [['transactionId', 'ASC']],
      raw: true
    });

    console.log(`\n=== CHARGING TRANSACTIONS (${transactions.length}) ===`);
    let totalCharged = 0;
    transactions.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      totalCharged += amount;
      console.log(`TX ${t.transactionId}: ₦${amount.toFixed(2)} ${t.status} ${t.startTime} - ${t.stopTime}`);
    });
    console.log(`\nTotal charged across all transactions: ₦${totalCharged.toFixed(2)}`);

    // Get ALL payment transactions
    const payments = await PaymentTransaction.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'ASC']],
      raw: true
    });

    console.log(`\n=== PAYMENT TRANSACTIONS (${payments.length}) ===`);
    let totalCredits = 0;
    let totalDebits = 0;
    payments.forEach(p => {
      const amount = parseFloat(p.amount);
      if (p.type === 'CREDIT') {
        totalCredits += amount;
      } else {
        totalDebits += amount;
      }
    });
    console.log(`Total Credits (top-ups + refunds): ₦${totalCredits.toFixed(2)}`);
    console.log(`Total Debits (charging): ₦${totalDebits.toFixed(2)}`);
    console.log(`Net: ₦${(totalCredits - totalDebits).toFixed(2)}`);

    // Calculate expected balance
    const expectedBalance = totalCredits - totalDebits;
    console.log(`\nExpected balance: ₦${expectedBalance.toFixed(2)}`);
    console.log(`Actual DB balance: ₦${parseFloat(wallet.balance).toFixed(2)}`);
    console.log(`Difference: ₦${(expectedBalance - parseFloat(wallet.balance)).toFixed(2)}`);

    // Check for duplicate billing on TX 744856
    console.log(`\n=== CHECKING TX 744856 FOR DUPLICATE BILLING ===`);
    const tx744856Payments = payments.filter(p => p.reference && p.reference.includes('744856'));
    console.log(`Found ${tx744856Payments.length} payments for TX 744856:`);
    tx744856Payments.forEach(p => {
      console.log(`${p.type} ₦${parseFloat(p.amount).toFixed(2)} ${p.reference} ${p.createdAt}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

check();
