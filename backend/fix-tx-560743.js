/**
 * Fix transaction 560743 - reconcile incorrectly set amount to ₦13,025,600
 * Correct amount should be energyDelivered(Wh) * pricePerWh = energyDelivered * 0.4
 */
require('dotenv').config();
const { Transaction, MobileUser, Wallet, PaymentTransaction, ChargingStation, Location, sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

async function fixTransaction() {
  try {
    await sequelize.transaction(async (t) => {
      const transaction = await Transaction.findOne({
        where: { transactionId: 560743 },
        transaction: t
      });

      if (!transaction) {
        console.log('Transaction 560743 not found');
        return;
      }

      console.log('Current state:', {
        transactionId: transaction.transactionId,
        energyDelivered: transaction.energyDelivered,
        amount: transaction.amount,
        status: transaction.status,
        chargePointId: transaction.chargePointId
      });

      // Get location pricing
      const station = await ChargingStation.findOne({
        where: { chargePointId: transaction.chargePointId },
        transaction: t
      });

      let pricePerWh = 0.4;
      let minimumCharge = 0;
      if (station && station.locationId) {
        const location = await Location.findByPk(station.locationId, { transaction: t });
        if (location) {
          pricePerWh = location.pricePerWh || 0.4;
          minimumCharge = location.minimumCharge || 0;
          console.log('Location pricing:', { pricePerWh, minimumCharge, locationId: location.id });
        }
      }

      const energy = parseFloat(transaction.energyDelivered) || 0; // in Wh
      const energyInKwh = energy / 1000;
      const ratePerKwh = pricePerWh * 1000;
      const correctAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge);

      console.log('Calculation:', {
        energyWh: energy,
        energyKwh: energyInKwh,
        ratePerKwh,
        correctAmount
      });

      const currentAmount = parseFloat(transaction.amount) || 0;
      const adjustment = currentAmount - correctAmount;

      console.log(`Adjusting: ₦${currentAmount.toFixed(2)} → ₦${correctAmount.toFixed(2)} (diff: ₦${adjustment.toFixed(2)})`);

      // Update transaction
      await transaction.update({ amount: correctAmount }, { transaction: t });

      // Fix wallet - credit back the overcharge
      if (Math.abs(adjustment) > 0.01) {
        const user = await MobileUser.findOne({
          where: { tagId: transaction.idTag },
          transaction: t
        });

        if (user) {
          const wallet = await Wallet.findOne({
            where: { userId: user.id },
            transaction: t
          });

          if (wallet) {
            const currentBalance = parseFloat(wallet.balance);
            const newBalance = currentBalance + adjustment;
            await wallet.update({ balance: newBalance }, { transaction: t });

            console.log(`Wallet: ₦${currentBalance.toFixed(2)} → ₦${newBalance.toFixed(2)} (credited ₦${adjustment.toFixed(2)})`);

            await PaymentTransaction.create({
              userId: user.id,
              walletId: wallet.id,
              amount: Math.abs(adjustment),
              type: adjustment > 0 ? 'CREDIT' : 'DEBIT',
              status: 'SUCCESS',
              reference: `FIX-RECONCILE-TX560743-${Date.now()}`,
              description: `Fix incorrect reconcile for TX 560743 (was ₦${currentAmount.toFixed(2)}, correct is ₦${correctAmount.toFixed(2)})`,
              metadata: JSON.stringify({
                transaction_id: 560743,
                previous_amount: currentAmount,
                corrected_amount: correctAmount,
                adjustment
              })
            }, { transaction: t });

            console.log('PaymentTransaction record created');
          }
        }
      }

      console.log('DONE - Transaction fixed');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

fixTransaction();
