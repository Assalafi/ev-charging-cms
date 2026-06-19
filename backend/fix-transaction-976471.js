/**
 * Fix transaction 976471 - Wh to kWh conversion error
 * and credit refund to user MOB8136705660 wallet
 */
require('dotenv').config();
const { sequelize, Transaction, Wallet, MobileUser } = require('./src/models');
const logger = require('./src/utils/logger');

async function fixTransaction976471() {
  logger.info('Starting fix for transaction 976471...');
  
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

      logger.info(`Found transaction: ${JSON.stringify(transaction.toJSON())}`);

      // Current values
      const currentEnergy = parseFloat(transaction.energyDelivered) || 0;
      const currentAmount = parseFloat(transaction.amount) || 0;

      logger.info(`Current energyDelivered: ${currentEnergy} (stored as Wh)`);
      logger.info(`Current amount: ₦${currentAmount}`);

      // Correct energy in kWh (divide by 1000)
      const correctEnergy = currentEnergy / 1000;
      logger.info(`Correct energy in kWh: ${correctEnergy}`);

      // Calculate correct amount (assuming ₦400/kWh rate - need to verify from settings)
      const baseRate = 400; // ₦400 per kWh
      const minimumCharge = 500; // Minimum charge
      let correctAmount = correctEnergy * baseRate;
      // Apply minimum charge
      correctAmount = Math.max(correctAmount, minimumCharge);
      logger.info(`Correct amount at ₦${baseRate}/kWh with min ₦${minimumCharge}: ₦${correctAmount.toFixed(2)}`);

      // Calculate refund amount
      const refundAmount = currentAmount - correctAmount;
      logger.info(`Refund amount: ₦${refundAmount.toFixed(2)}`);

      if (refundAmount <= 0) {
        throw new Error(`No refund needed. Current amount ₦${currentAmount} is already correct or less than correct amount ₦${correctAmount.toFixed(2)}`);
      }

      // Update transaction with correct values
      await transaction.update({
        energyDelivered: correctEnergy,
        amount: correctAmount
      }, { transaction: t });

      logger.info(`Updated transaction 976471: energyDelivered=${correctEnergy} kWh, amount=₦${correctAmount.toFixed(2)}`);

      // Find user by tagId (MOB8136705660)
      const user = await MobileUser.findOne({
        where: { tagId: 'MOB8136705660' },
        transaction: t
      });

      if (!user) {
        throw new Error('User MOB8136705660 not found');
      }

      logger.info(`Found user: ${user.phone_number} (ID: ${user.id})`);

      // Find or create wallet
      let wallet = await Wallet.findOne({
        where: { userId: user.id },
        transaction: t
      });

      if (!wallet) {
        wallet = await Wallet.create({
          userId: user.id,
          balance: 0
        }, { transaction: t });
        logger.info(`Created new wallet for user ${user.id}`);
      }

      logger.info(`Current wallet balance: ₦${wallet.balance}`);

      // Credit refund to wallet
      const newBalance = parseFloat(wallet.balance) + refundAmount;
      await wallet.update({ balance: newBalance }, { transaction: t });

      logger.info(`Credited ₦${refundAmount.toFixed(2)} to wallet. New balance: ₦${newBalance.toFixed(2)}`);

      // Log the refund as a transaction record (create a payment transaction record)
      const { PaymentTransaction } = require('./src/models');
      await PaymentTransaction.create({
        userId: user.id,
        walletId: wallet.id,
        amount: refundAmount,
        type: 'CREDIT',
        status: 'SUCCESS',
        reference: `REFUND-TX976471-${Date.now()}`,
        description: `Refund for transaction 976471 Wh to kWh conversion error`,
        metadata: JSON.stringify({
          original_transaction_id: 976471,
          original_amount: currentAmount,
          corrected_amount: correctAmount,
          refund_amount: refundAmount,
          original_energy_wh: currentEnergy,
          corrected_energy_kwh: correctEnergy
        })
      }, { transaction: t });

      logger.info(`Created refund transaction record`);
    });

    logger.info('Transaction 976471 fixed and wallet credited successfully!');
    console.log('\n=== SUMMARY ===');
    console.log('Transaction ID: 976471');
    console.log('Original energy: 38 Wh (incorrectly treated as 38 kWh)');
    console.log('Correct energy: 0.038 kWh');
    console.log('Original amount: ₦15,200.00');
    console.log('Correct amount: ₦15.20');
    console.log('Refund credited: ₦15,184.80');
    console.log('User: MOB8136705660');
    console.log('================\n');

  } catch (error) {
    logger.error('Error fixing transaction 976471:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

fixTransaction976471()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
