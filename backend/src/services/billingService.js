/**
 * Billing Service — Atomic wallet deduction for charging sessions
 * 
 * Uses PostgreSQL row-level locking (SELECT ... FOR UPDATE) inside a 
 * serialisable database transaction so that:
 *   1. The wallet row is locked before reading its balance.
 *   2. The charging transaction's billedAt is checked to prevent double billing.
 *   3. Wallet balance is decremented and a DEBIT PaymentTransaction is created
 *      atomically — either everything commits or nothing does.
 *   4. If the server crashes mid-way the DB transaction is rolled back
 *      automatically by PostgreSQL.
 *
 * A reconciliation function (billUnbilledTransactions) can be called on startup
 * to catch any completed transactions that were never billed.
 */

const logger = require('../utils/logger');
const { Sequelize } = require('sequelize');
const { Transaction, MobileUser, Wallet, PaymentTransaction, sequelize } = require('../models');
const { Op } = require('sequelize');

let reconciliationInterval = null;
let reconciliationRunning = false;
const RECONCILIATION_INTERVAL_MS = Number.parseInt(
  process.env.BILLING_RECONCILIATION_INTERVAL_MS || '60000',
  10
);
const MAX_RETRY_BATCH = Number.parseInt(process.env.BILLING_RECONCILIATION_BATCH || '100', 10);

/**
 * Deduct the charging amount from the user's wallet.
 * 
 * @param {number} transactionId - The OCPP transactionId
 * @returns {object} { success, message, newBalance? }
 */
async function billTransaction(transactionId) {
  const dbTx = await sequelize.transaction({
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
  });

  try {
    // 1. Lock the charging transaction row and verify it hasn't been billed yet
    const chargingTx = await Transaction.findOne({
      where: { transactionId },
      lock: dbTx.LOCK.UPDATE,
      transaction: dbTx
    });

    if (!chargingTx) {
      await dbTx.rollback();
      logger.warn(`Billing: Transaction ${transactionId} not found`);
      return { success: false, message: 'Transaction not found' };
    }

    // Already billed — idempotent, just return success
    if (chargingTx.billedAt) {
      await dbTx.rollback();
      logger.info(`Billing: Transaction ${transactionId} already billed at ${chargingTx.billedAt}`);
      return { success: true, message: 'Already billed' };
    }

    // No amount to bill (free session or 0 energy)
    const amount = parseFloat(chargingTx.amount) || 0;
    if (amount <= 0) {
      // Mark as billed with zero amount so reconciliation skips it
      await chargingTx.update({
        billedAt: new Date(),
        billingLastError: null,
        billingNextAttemptAt: null,
        billingAttempts: (chargingTx.billingAttempts || 0) + 1
      }, { transaction: dbTx });
      await dbTx.commit();
      logger.info(`Billing: Transaction ${transactionId} has zero amount, marked as billed`);
      return { success: true, message: 'Zero amount, no deduction needed' };
    }

    // 2. Find user via idTag
    const user = await MobileUser.findOne({
      where: { tagId: chargingTx.idTag },
      transaction: dbTx
    });

    if (!user) {
      await dbTx.rollback();
      logger.warn(`Billing: No user found for idTag ${chargingTx.idTag} (tx ${transactionId})`);
      await recordBillingFailure(transactionId, new Error('User not found')).catch(() => {});
      return { success: false, message: 'User not found' };
    }

    // 3. Lock the wallet row for atomic balance update
    const wallet = await Wallet.findOne({
      where: { userId: user.id },
      lock: dbTx.LOCK.UPDATE,
      transaction: dbTx
    });

    if (!wallet) {
      await dbTx.rollback();
      logger.warn(`Billing: No wallet found for user ${user.id} (tx ${transactionId})`);
      await recordBillingFailure(transactionId, new Error('Wallet not found')).catch(() => {});
      return { success: false, message: 'Wallet not found' };
    }

    const currentBalance = parseFloat(wallet.balance);
    const newBalance = currentBalance - amount;

    // 4. Deduct wallet balance (allow negative — they owe us, don't block completion)
    await wallet.update({ balance: newBalance }, { transaction: dbTx });

    // 5. Create DEBIT payment record for audit trail
    const energyWh = Math.round(chargingTx.energyDelivered || 0);
    await PaymentTransaction.create({
      userId: user.id,
      walletId: wallet.id,
      type: 'DEBIT',
      amount: amount,
      currency: 'NGN',
      reference: `CHG-${transactionId}-${Date.now()}`,
      gateway: 'internal',
      status: 'SUCCESS',
      description: `Charging session ${transactionId} — ${energyWh} Wh`,
      metadata: {
        transactionId: chargingTx.transactionId,
        chargePointId: chargingTx.chargePointId,
        energyDelivered: chargingTx.energyDelivered,
        previousBalance: currentBalance,
        newBalance: newBalance
      }
    }, { transaction: dbTx });

    // 6. Mark charging transaction as billed
    await chargingTx.update({
      billedAt: new Date(),
      billingLastError: null,
      billingNextAttemptAt: null,
      billingAttempts: (chargingTx.billingAttempts || 0) + 1
    }, { transaction: dbTx });

    // 7. Commit — everything succeeds or nothing does
    await dbTx.commit();

    logger.info(
      `Billing SUCCESS: Transaction ${transactionId} — ₦${amount.toFixed(2)} deducted from user ${user.id} ` +
      `(${user.email}). Balance: ₦${currentBalance.toFixed(2)} → ₦${newBalance.toFixed(2)}`
    );

    return { success: true, message: 'Billed successfully', newBalance };

  } catch (error) {
    // Rollback on any error — wallet and records stay untouched
    try { await dbTx.rollback(); } catch (_) {}
    await recordBillingFailure(transactionId, error).catch(recordError => {
      logger.warn(`Could not persist billing retry state for ${transactionId}: ${recordError.message}`);
    });
    logger.error(`Billing FAILED for transaction ${transactionId}:`, error);
    return { success: false, message: error.message };
  }
}

async function recordBillingFailure(transactionId, error) {
  const transaction = await Transaction.findOne({
    where: { transactionId },
    attributes: ['billingAttempts']
  });
  if (!transaction) return;

  const attempts = (transaction.billingAttempts || 0) + 1;
  const delay = Math.min(60 * 60 * 1000, Math.max(30 * 1000, 2 ** Math.min(attempts, 8) * 1000));
  await Transaction.update({
    billingAttempts: attempts,
    billingLastError: String(error?.message || error).slice(0, 2000),
    billingNextAttemptAt: new Date(Date.now() + delay)
  }, { where: { transactionId } });
}

/**
 * Reconciliation: find all completed/stopped transactions that were never billed
 * and bill them now. Safe to call on every server startup.
 */
async function billUnbilledTransactions() {
  if (reconciliationRunning) return { skipped: true };
  reconciliationRunning = true;
  try {
    const unbilled = await Transaction.findAll({
      where: {
        status: { [Op.in]: ['Completed', 'Stopped'] },
        billedAt: null,
        amount: { [Op.gt]: 0 },
        [Op.or]: [
          { billingNextAttemptAt: null },
          { billingNextAttemptAt: { [Op.lte]: new Date() } }
        ]
      },
      order: [['stopTime', 'ASC']],
      limit: MAX_RETRY_BATCH
    });

    if (unbilled.length === 0) {
      logger.info('Billing reconciliation: no unbilled transactions found');
      return { inspected: 0, billed: 0 };
    }

    logger.info(`Billing reconciliation: found ${unbilled.length} unbilled transaction(s)`);

    let billed = 0;
    for (const tx of unbilled) {
      const result = await billTransaction(tx.transactionId);
      logger.info(`Billing reconciliation: tx ${tx.transactionId} → ${result.message}`);
      if (result.success) billed += 1;
    }
    return { inspected: unbilled.length, billed };
  } catch (error) {
    logger.error('Billing reconciliation error:', error);
    return { inspected: 0, billed: 0, error: error.message };
  } finally {
    reconciliationRunning = false;
  }
}

function startBillingReconciliation() {
  if (reconciliationInterval) return;
  reconciliationInterval = setInterval(() => {
    billUnbilledTransactions().catch(error => {
      logger.error(`Billing reconciliation scheduler failed: ${error.message}`);
    });
  }, RECONCILIATION_INTERVAL_MS);
  logger.info(`Billing reconciliation scheduler started (every ${RECONCILIATION_INTERVAL_MS / 1000}s)`);
}

function stopBillingReconciliation() {
  if (reconciliationInterval) clearInterval(reconciliationInterval);
  reconciliationInterval = null;
}

module.exports = {
  billTransaction,
  billUnbilledTransactions,
  startBillingReconciliation,
  stopBillingReconciliation
};
