/**
 * Deduct remaining unbilled amount for transaction 560743
 * Already billed: ₦587.60
 * Correct total: ₦13,025.60
 * Remaining to deduct: ₦12,438.00
 */
require('dotenv').config();
const { Transaction, MobileUser, Wallet, PaymentTransaction, sequelize } = require('./src/models');

async function billRemaining() {
  try {
    await sequelize.transaction(async (t) => {
      const transaction = await Transaction.findOne({
        where: { transactionId: 560743 },
        transaction: t
      });

      if (!transaction) {
        console.log('Transaction not found');
        return;
      }

      const totalAmount = parseFloat(transaction.amount) || 0; // ₦13,025.60
      const alreadyBilled = 587.60; // From billing logs
      const remaining = totalAmount - alreadyBilled;

      console.log(`Total: ₦${totalAmount.toFixed(2)}, Already billed: ₦${alreadyBilled.toFixed(2)}, Remaining: ₦${remaining.toFixed(2)}`);

      if (remaining <= 0) {
        console.log('Nothing remaining to bill');
        return;
      }

      const user = await MobileUser.findOne({
        where: { tagId: transaction.idTag },
        transaction: t
      });

      if (!user) {
        console.log('User not found');
        return;
      }

      const wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: t
      });

      if (!wallet) {
        console.log('Wallet not found');
        return;
      }

      const currentBalance = parseFloat(wallet.balance);
      const newBalance = currentBalance - remaining;

      await wallet.update({ balance: newBalance }, { transaction: t });

      await PaymentTransaction.create({
        userId: user.id,
        walletId: wallet.id,
        amount: remaining,
        type: 'DEBIT',
        status: 'SUCCESS',
        reference: `CHG-REMAINING-560743-${Date.now()}`,
        gateway: 'internal',
        description: `Remaining charge for session 560743 (${transaction.energyDelivered} Wh)`,
        metadata: JSON.stringify({
          transactionId: 560743,
          totalAmount,
          alreadyBilled,
          remaining,
          previousBalance: currentBalance,
          newBalance
        })
      }, { transaction: t });

      console.log(`Deducted ₦${remaining.toFixed(2)} from wallet`);
      console.log(`Wallet: ₦${currentBalance.toFixed(2)} → ₦${newBalance.toFixed(2)}`);
      console.log('Done');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

billRemaining();
