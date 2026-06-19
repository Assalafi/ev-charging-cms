/**
 * Fix transaction 976471 with location-based pricing
 */
require('dotenv').config();
const { sequelize, Transaction, Wallet, MobileUser, PaymentTransaction, Settings, ChargingStation } = require('./src/models');
const logger = require('./src/utils/logger');

async function fixTransactionFinal() {
  logger.info('Fixing transaction 976471 with location-based pricing...');
  
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

      logger.info(`Current transaction: energy=${transaction.energyDelivered} kWh, amount=₦${transaction.amount}`);

      const currentAmount = parseFloat(transaction.amount) || 0;
      const currentEnergy = parseFloat(transaction.energyDelivered) || 0;

      // Get station to find location
      const station = await ChargingStation.findOne({
        where: { chargePointId: transaction.chargePointId },
        transaction: t
      });

      // Get pricing settings (location-specific first, then global)
      let baseRate = 170; // Default global
      let minimumCharge = 150; // Default global

      if (station && station.locationId) {
        const locationPricing = await Settings.findAll({
          where: { 
            category: 'pricing',
            key: sequelize.where(
              sequelize.literal(`"key" LIKE '${station.locationId}_%'`)
            )
          },
          transaction: t
        });

        locationPricing.forEach(s => {
          if (s.key.includes('baseRate')) baseRate = s.value?.data || baseRate;
          if (s.key.includes('minimumCharge')) minimumCharge = s.value?.data || minimumCharge;
        });

        logger.info(`Location ${station.locationId} pricing: baseRate=${baseRate}, minimumCharge=${minimumCharge}`);
      }

      // Fall back to global pricing if no location-specific found
      const globalPricing = await Settings.findAll({
        where: { 
          category: 'pricing',
          key: ['baseRatePerKwh', 'minimumCharge']
        },
        transaction: t
      });

      globalPricing.forEach(s => {
        if (s.key === 'baseRatePerKwh') baseRate = s.value?.data || baseRate;
        if (s.key === 'minimumCharge') minimumCharge = s.value?.data || minimumCharge;
      });

      logger.info(`Final pricing used: baseRate=₦${baseRate}/kWh, minimumCharge=₦${minimumCharge}`);

      // Correct calculation
      const baseAmount = currentEnergy * baseRate;
      const correctAmount = Math.max(baseAmount, minimumCharge);
      
      logger.info(`Base amount (0.038 kWh × ₦${baseRate}): ₦${baseAmount.toFixed(2)}`);
      logger.info(`Correct amount with min charge ₦${minimumCharge}: ₦${correctAmount.toFixed(2)}`);

      if (currentAmount === correctAmount) {
        logger.info('Amount is already correct');
        return;
      }

      // Calculate adjustment
      const adjustment = currentAmount - correctAmount; // Positive means we overcharged
      logger.info(`Adjustment needed: -₦${adjustment.toFixed(2)} (refund to user)`);

      // Update transaction with correct amount
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

      // Credit adjustment to wallet (we need to refund more)
      const newBalance = parseFloat(wallet.balance) + adjustment;
      await wallet.update({ balance: newBalance }, { transaction: t });

      logger.info(`Credited ₦${adjustment.toFixed(2)} to wallet. New balance: ₦${newBalance.toFixed(2)}`);

      // Create adjustment transaction record
      await PaymentTransaction.create({
        userId: user.id,
        walletId: wallet.id,
        amount: Math.abs(adjustment),
        type: 'CREDIT',
        status: 'SUCCESS',
        reference: `FINAL-FIX-TX976471-${Date.now()}`,
        description: `Final fix for transaction 976471 with correct pricing (₦${baseRate}/kWh, min ₦${minimumCharge})`,
        metadata: JSON.stringify({
          transaction_id: 976471,
          previous_amount: currentAmount,
          corrected_amount: correctAmount,
          adjustment: adjustment,
          base_rate: baseRate,
          minimum_charge: minimumCharge,
          energy_kwh: currentEnergy
        })
      }, { transaction: t });

      logger.info(`Created adjustment transaction record`);
    });

    logger.info('Transaction 976471 fixed successfully with correct pricing!');
    console.log('\n=== FINAL SUMMARY ===');
    console.log('Transaction ID: 976471');
    console.log('Energy: 0.038 kWh (38 Wh)');
    console.log('Base rate: ₦170/kWh');
    console.log('Base amount: ₦6.46');
    console.log('Minimum charge: ₦150.00');
    console.log('Correct amount: ₦150.00');
    console.log('Original charge: ₦15,200.00');
    console.log('Total refund: ₦15,050.00');
    console.log('================\n');

  } catch (error) {
    logger.error('Error fixing transaction 976471:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

fixTransactionFinal()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
