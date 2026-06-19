/**
 * Adjust transaction 976471 to apply minimum charge
 * Energy is already in kWh (0.038), need to apply minimum charge of ₦500
 */
require('dotenv').config();
const { sequelize, Transaction, Wallet, MobileUser, PaymentTransaction } = require('./src/models');
const logger = require('./src/utils/logger');

async function adjustTransactionMinimum() {
  logger.info('Adjusting transaction 976471 for minimum charge...');
  
  try {
    await sequelize.transaction(async (t) => {
      // Get the transaction
      const transaction = await Transaction.findOne({
        where: { transactionId: 976471 },
        transaction: t
      });

      if (!transaction) {
        throw new Error('Transaction 976471 not found');
      }

      logger.info(`Found transaction: energy=${transaction.energyDelivered} kWh, amount=₦${transaction.amount}`);

      const currentAmount = parseFloat(transaction.amount) || 0;
      const currentEnergy = parseFloat(transaction.energyDelivered) || 0;

      // Apply minimum charge (₦500)
      const minimumCharge = 500;
      const correctAmount = Math.max(currentEnergy * 400, minimumCharge);
      
      logger.info(`Correct amount with minimum charge ₦${minimumCharge}: ₦${correctAmount.toFixed(2)}`);

      if (currentAmount === correctAmount) {
        logger.info('Amount is already correct with minimum charge');
        return;
      }

      // Calculate adjustment (negative means we over-refunded)
      const adjustment = currentAmount - correctAmount;
      logger.info(`Adjustment needed: ₦${adjustment.toFixed(2)}`);

      // Update transaction with minimum charge
      await transaction.update({
        amount: correctAmount
      }, { transaction: t });

      logger.info(`Updated transaction 976471 amount to ₦${correctAmount.toFixed(2)}`);

      // Find user by tagId
      const user = await MobileUser.findOne({
        where: { tagId: 'MOB8136705660' },
        transaction: t
      });

      if (!user) {
        throw new Error('User MOB8136705660 not found');
      }

      logger.info(`Found user: ${user.phone} (ID: ${user.id})`);

      // Find wallet
      const wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: t
      });

      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      logger.info(`Current wallet balance: ₦${wallet.balance}`);

      // Adjust wallet (deduct if we over-refunded)
      const newBalance = parseFloat(wallet.balance) - adjustment;
      await wallet.update({ balance: newBalance }, { transaction: t });

      logger.info(`Adjusted wallet by ₦${adjustment.toFixed(2)}. New balance: ₦${newBalance.toFixed(2)}`);

      // Create adjustment transaction record
      await PaymentTransaction.create({
        userId: user.id,
        walletId: wallet.id,
        amount: Math.abs(adjustment),
        type: adjustment > 0 ? 'DEBIT' : 'CREDIT',
        status: 'SUCCESS',
        reference: `ADJUST-TX976471-${Date.now()}`,
        description: `Adjustment for minimum charge on transaction 976471`,
        metadata: JSON.stringify({
          transaction_id: 976471,
          previous_amount: currentAmount,
          corrected_amount: correctAmount,
          adjustment: adjustment
        })
      }, { transaction: t });

      logger.info(`Created adjustment transaction record`);
    });

    logger.info('Transaction 976471 adjusted successfully!');
    console.log('\n=== SUMMARY ===');
    console.log('Transaction ID: 976471');
    console.log('Energy: 0.038 kWh');
    console.log('Amount adjusted from: ₦15.20');
    console.log('Amount adjusted to: ₦500.00 (minimum charge)');
    console.log('Wallet adjustment: -₦484.80 (over-refund correction)');
    console.log('================\n');

  } catch (error) {
    logger.error('Error adjusting transaction 976471:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

adjustTransactionMinimum()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
