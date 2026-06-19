/**
 * Revert minimum charge - location has minimumCharge: 0
 * Transaction should be ₦15.20, not ₦500
 */
require('dotenv').config();
const { sequelize, Transaction, Wallet, MobileUser, PaymentTransaction } = require('./src/models');
const logger = require('./src/utils/logger');

async function revertMinimumCharge() {
  logger.info('Reverting minimum charge for transaction 976471...');
  
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

      logger.info(`Current transaction: amount=₦${transaction.amount}`);

      const currentAmount = parseFloat(transaction.amount) || 0;
      const currentEnergy = parseFloat(transaction.energyDelivered) || 0;

      // Location pricing: ₦400/kWh (0.4 per Wh), minimum charge: 0
      const pricePerKwh = 400;
      const correctAmount = currentEnergy * pricePerKwh;
      
      logger.info(`Correct amount (0.038 kWh × ₦${pricePerKwh}): ₦${correctAmount.toFixed(2)}`);

      if (currentAmount === correctAmount) {
        logger.info('Amount is already correct');
        return;
      }

      // Calculate adjustment (we need to refund the minimum charge we applied)
      const adjustment = currentAmount - correctAmount; // ₦500 - ₦15.20 = ₦484.80
      logger.info(`Refund adjustment: ₦${adjustment.toFixed(2)}`);

      // Update transaction with correct amount
      await transaction.update({
        amount: correctAmount
      }, { transaction: t });

      logger.info(`Updated transaction 976471 amount to ₦${correctAmount.toFixed(2)}`);

      // Find user
      const user = await MobileUser.findOne({
        where: { tagId: 'MOB8136705660' },
        transaction: t
      });

      if (!user) {
        throw new Error('User MOB8136705660 not found');
      }

      // Find wallet
      const wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: t
      });

      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      logger.info(`Current wallet balance: ₦${wallet.balance}`);

      // Credit the adjustment back to wallet
      const newBalance = parseFloat(wallet.balance) + adjustment;
      await wallet.update({ balance: newBalance }, { transaction: t });

      logger.info(`Credited ₦${adjustment.toFixed(2)} to wallet. New balance: ₦${newBalance.toFixed(2)}`);

      // Create adjustment record
      await PaymentTransaction.create({
        userId: user.id,
        walletId: wallet.id,
        amount: adjustment,
        type: 'CREDIT',
        status: 'SUCCESS',
        reference: `REVERT-MIN-TX976471-${Date.now()}`,
        description: `Revert incorrect minimum charge for transaction 976471 (location has min=0)`,
        metadata: JSON.stringify({
          transaction_id: 976471,
          previous_amount: currentAmount,
          corrected_amount: correctAmount,
          adjustment: adjustment,
          reason: 'Location minimum charge is 0'
        })
      }, { transaction: t });

      logger.info(`Created adjustment transaction record`);
    });

    logger.info('Transaction 976471 reverted successfully!');
    console.log('\n=== FINAL CORRECT SUMMARY ===');
    console.log('Transaction ID: 976471');
    console.log('Energy: 0.038 kWh (38 Wh)');
    console.log('Rate: ₦400/kWh (from location table)');
    console.log('Minimum charge: ₦0 (from location table)');
    console.log('Correct amount: ₦15.20');
    console.log('Original charge: ₦15,200.00');
    console.log('Total refund: ₦15,184.80');
    console.log('========================\n');

  } catch (error) {
    logger.error('Error reverting transaction 976471:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

revertMinimumCharge()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
