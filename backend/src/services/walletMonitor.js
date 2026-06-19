/**
 * Wallet Monitor Service
 * 
 * Periodically checks all active charging sessions and stops them
 * if the user's wallet balance is exhausted.
 * 
 * This runs independently of MeterValues to ensure sessions are
 * stopped even if the charger doesn't send frequent meter updates.
 */

const logger = require('../utils/logger');
const { Transaction, MobileUser, Wallet, ChargingStation, Location, sequelize } = require('../models');

let intervalHandle = null;
let ocppServerRef = null;
const stoppingInProgress = new Set(); // Track sessions being stopped to avoid duplicates

const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds

/**
 * Initialize the wallet monitor with a reference to the OCPP server
 * (avoids circular dependency issues)
 */
function init(ocppServer) {
  ocppServerRef = ocppServer;
  logger.info('WalletMonitor: Initialized with OCPP server reference');
}

/**
 * Start the periodic wallet balance check
 */
function start() {
  if (intervalHandle) {
    logger.warn('WalletMonitor: Already running');
    return;
  }

  intervalHandle = setInterval(checkAllActiveSessions, CHECK_INTERVAL_MS);
  logger.info(`WalletMonitor: Started (checking every ${CHECK_INTERVAL_MS / 1000}s)`);
  
  // Run immediately on start
  setTimeout(checkAllActiveSessions, 5000);
}

/**
 * Stop the wallet monitor
 */
function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('WalletMonitor: Stopped');
  }
}

/**
 * Check all active sessions and stop any where wallet is exhausted
 */
async function checkAllActiveSessions() {
  try {
    // Get all InProgress transactions
    const activeSessions = await Transaction.findAll({
      where: { status: 'InProgress' },
      attributes: ['transactionId', 'chargePointId', 'idTag', 'amount', 'energyDelivered', 'startMeterValue', 'startTime']
    });

    if (activeSessions.length === 0) return;

    // Group sessions by user (idTag)
    const userSessions = {};
    for (const session of activeSessions) {
      if (!session.idTag) continue;
      if (!userSessions[session.idTag]) {
        userSessions[session.idTag] = [];
      }
      userSessions[session.idTag].push(session);
    }

    // Check each user's total cost vs wallet
    for (const [idTag, sessions] of Object.entries(userSessions)) {
      try {
        const user = await MobileUser.findOne({ where: { tagId: idTag } });
        if (!user) continue;

        const wallet = await Wallet.findOne({ where: { userId: user.id } });
        if (!wallet) continue;

        const walletBalance = parseFloat(wallet.balance) || 0;
        const totalCost = sessions.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

        if (totalCost >= walletBalance && walletBalance >= 0) {
          logger.warn(
            `WalletMonitor AUTO-STOP: User ${user.phone || idTag} wallet exhausted. ` +
            `Total cost: ₦${totalCost.toFixed(2)} across ${sessions.length} session(s), ` +
            `Balance: ₦${walletBalance.toFixed(2)}. Stopping ALL sessions.`
          );

          for (const session of sessions) {
            if (stoppingInProgress.has(session.transactionId)) {
              logger.info(`WalletMonitor: tx ${session.transactionId} stop already in progress, skipping`);
              continue;
            }
            await stopSession(session);
          }
        }
      } catch (userErr) {
        logger.error(`WalletMonitor: Error checking user ${idTag}:`, userErr.message);
      }
    }
  } catch (error) {
    logger.error('WalletMonitor: Error in checkAllActiveSessions:', error.message);
  }
}

/**
 * Stop a single charging session
 */
async function stopSession(session) {
  const { transactionId, chargePointId } = session;

  stoppingInProgress.add(transactionId);
  // Auto-clear after 60 seconds in case stop process hangs
  setTimeout(() => stoppingInProgress.delete(transactionId), 60000);

  try {
    if (!ocppServerRef) {
      logger.error(`WalletMonitor: No OCPP server reference, cannot stop tx ${transactionId}`);
      stoppingInProgress.delete(transactionId);
      return;
    }

    if (!ocppServerRef.isConnected(chargePointId)) {
      logger.warn(
        `WalletMonitor: Station ${chargePointId} not connected. ` +
        `Completing tx ${transactionId} via DB (offline auto-stop).`
      );
      await offlineStop(session);
      return;
    }

    // Send RemoteStopTransaction
    logger.info(`WalletMonitor: Sending RemoteStopTransaction for tx ${transactionId} at ${chargePointId}`);
    const result = await ocppServerRef.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
      transactionId: transactionId
    });

    if (result && result.status === 'Accepted') {
      logger.info(`WalletMonitor: RemoteStopTransaction ACCEPTED for tx ${transactionId}`);
    } else {
      logger.warn(
        `WalletMonitor: RemoteStopTransaction ${result?.status || 'FAILED'} for tx ${transactionId}. ` +
        `Falling back to offline stop.`
      );
      // If charger rejects, force-complete via DB
      await offlineStop(session);
    }
  } catch (error) {
    logger.error(`WalletMonitor: Error stopping tx ${transactionId}:`, error.message);
    // Retry with offline stop
    try {
      await offlineStop(session);
    } catch (offlineErr) {
      logger.error(`WalletMonitor: Offline stop also failed for tx ${transactionId}:`, offlineErr.message);
    }
  }
}

/**
 * Force-complete a transaction via database when charger is offline or rejects
 */
async function offlineStop(session) {
  const { transactionId, chargePointId, energyDelivered, amount } = session;

  try {
    const transaction = await Transaction.findOne({
      where: { transactionId, status: 'InProgress' }
    });

    if (!transaction) {
      logger.info(`WalletMonitor offlineStop: tx ${transactionId} no longer InProgress`);
      return;
    }

    // Calculate final amount using location pricing
    let finalAmount = parseFloat(amount) || 0;
    const energy = parseFloat(energyDelivered) || 0;

    try {
      const station = await ChargingStation.findOne({
        where: { chargePointId },
        attributes: ['locationId']
      });

      if (station && station.locationId) {
        const location = await Location.findByPk(station.locationId);
        if (location) {
          const pricePerWh = location.pricePerWh || 0.4;
          const minimumCharge = location.minimumCharge || 0;
          const energyInKwh = energy / 1000;
          const ratePerKwh = pricePerWh * 1000;
          finalAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge);
        }
      }
    } catch (priceErr) {
      logger.error(`WalletMonitor offlineStop: Price calc error for tx ${transactionId}:`, priceErr.message);
    }

    await transaction.update({
      status: 'Completed',
      stopTime: new Date(),
      amount: finalAmount,
      reason: 'WalletExhausted'
    });

    logger.info(
      `WalletMonitor offlineStop: tx ${transactionId} completed via DB. ` +
      `Energy: ${energy} Wh, Amount: ₦${finalAmount.toFixed(2)}`
    );

    // Bill the transaction (idempotent - billingService checks billedAt to prevent double billing)
    // We must bill here because the charger is offline and will never send StopTransaction
    try {
      const { billTransaction } = require('./billingService');
      const billingResult = await billTransaction(transactionId);
      if (billingResult.success) {
        logger.info(`WalletMonitor offlineStop: Billing completed for tx ${transactionId}: ${billingResult.message}`);
      } else {
        logger.warn(`WalletMonitor offlineStop: Billing not completed for tx ${transactionId}: ${billingResult.message}`);
      }
    } catch (billErr) {
      logger.error(`WalletMonitor offlineStop: Billing error for tx ${transactionId}:`, billErr.message);
    }

    // Update station/connector status
    try {
      await ChargingStation.update(
        { status: 'Available', currentTransaction: null },
        { where: { chargePointId } }
      );
      await sequelize.query(
        `UPDATE connectors SET status = 'Available', "transactionId" = NULL, "updatedAt" = NOW() WHERE "chargePointId" = $1`,
        { bind: [chargePointId], type: sequelize.QueryTypes.UPDATE }
      );
    } catch (statusErr) {
      logger.error(`WalletMonitor: Status update error for ${chargePointId}:`, statusErr.message);
    }
  } catch (error) {
    logger.error(`WalletMonitor offlineStop error for tx ${transactionId}:`, error.message);
    throw error;
  }
}

module.exports = { init, start, stop, checkAllActiveSessions };
