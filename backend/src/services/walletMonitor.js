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
const { Transaction, MobileUser, Wallet } = require('../models');
const {
  resolveCanonicalOcppTransactionId,
} = require('./ocppTransactionResolver');
const { findMobileUserByTag } = require('./chargerTagService');

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
      attributes: [
        'transactionId', 'chargePointId', 'connectorId', 'idTag', 'amount',
        'energyDelivered', 'startMeterValue', 'startTime', 'reason'
      ]
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
        const user = await findMobileUserByTag(idTag);
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
            const stopKey = `${session.chargePointId}:${session.connectorId || 1}`;
            if (stoppingInProgress.has(stopKey)) {
              logger.info(`WalletMonitor: stop already in progress for ${stopKey}, skipping`);
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
  const { transactionId, chargePointId, connectorId } = session;
  const stopKey = `${chargePointId}:${connectorId || 1}`;

  stoppingInProgress.add(stopKey);
  // Auto-clear after 60 seconds in case stop process hangs
  setTimeout(() => stoppingInProgress.delete(stopKey), 60000);

  try {
    if (!ocppServerRef) {
      logger.error(`WalletMonitor: No OCPP server reference, cannot stop tx ${transactionId}`);
      stoppingInProgress.delete(stopKey);
      return;
    }

    if (!ocppServerRef.isConnected(chargePointId)) {
      logger.warn(
        `WalletMonitor: Station ${chargePointId} not connected. ` +
        `Marking tx ${transactionId} for stop on reconnect; stale energy will not be billed.`
      );
      await offlineStop(session);
      return;
    }

    // A recovery row can have an internal CMS ID that is different from the
    // OCPP transaction ID still held by the charger. Always send the latest
    // canonical ID reported by MeterValues when one is available.
    const commandTransactionId = await resolveCanonicalOcppTransactionId({
      chargePointId,
      connectorId: connectorId || 1,
      fallbackTransactionId: transactionId,
    });
    if (!commandTransactionId) {
      logger.warn(`WalletMonitor: No canonical OCPP transaction ID for ${chargePointId}; not sending a blind stop`);
      stoppingInProgress.delete(stopKey);
      return;
    }

    // Send RemoteStopTransaction using the charge point's ID, not an
    // internal recovery transaction ID.
    logger.info(
      `WalletMonitor: Sending RemoteStopTransaction for OCPP tx ${commandTransactionId} ` +
        `(internal tx ${transactionId}) at ${chargePointId}`
    );
    const result = await ocppServerRef.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
      transactionId: commandTransactionId
    });

    if (result?.success) {
      logger.info(
        `WalletMonitor: RemoteStopTransaction sent for OCPP tx ${commandTransactionId}; ` +
          `awaiting StopTransaction`
      );
      setTimeout(async () => {
        try {
          const stillActive = await Transaction.findOne({
            where: { transactionId, status: 'InProgress' }
          });
          if (stillActive && !ocppServerRef.isConnected(chargePointId)) {
            logger.warn(
              `WalletMonitor: Station ${chargePointId} went offline without StopTransaction; ` +
                `completing internal tx ${transactionId} via offline recovery`
            );
            await offlineStop(stillActive);
          } else if (stillActive) {
            logger.warn(
              `WalletMonitor: StopTransaction not yet received for OCPP tx ${commandTransactionId}; ` +
                `leaving session open while station remains connected`
            );
          }
        } catch (timeoutError) {
          logger.error(`WalletMonitor: StopTransaction timeout check failed for OCPP tx ${commandTransactionId}:`, timeoutError.message);
        }
      }, 30000);
    } else {
      logger.warn(
        `WalletMonitor: Could not send RemoteStopTransaction for OCPP tx ${commandTransactionId}. ` +
          `Keeping the transaction open for retry/reconciliation.`
      );
      stoppingInProgress.delete(stopKey);
    }
  } catch (error) {
    logger.error(`WalletMonitor: Error stopping OCPP tx for internal tx ${transactionId}:`, error.message);
    stoppingInProgress.delete(stopKey);
  }
}

/**
 * Persist a stop request while the charger is offline. The physical charger
 * can continue delivering energy without a data connection, so completing and
 * billing here would knowingly undercharge and lose the later meter delta.
 */
async function offlineStop(session) {
  const { transactionId } = session;

  try {
    const transaction = await Transaction.findOne({
      where: { transactionId, status: 'InProgress' }
    });

    if (!transaction) {
      logger.info(`WalletMonitor offlineStop: tx ${transactionId} no longer InProgress`);
      return;
    }

    await transaction.update({
      stopReason: 'WalletExhaustedPendingReconnect',
      offlineSince: transaction.offlineSince || new Date()
    });
    logger.warn(
      `WalletMonitor offlineStop: tx ${transactionId} remains InProgress until ` +
        `the charger reconnects and supplies an authoritative final meter`
    );
  } catch (error) {
    logger.error(`WalletMonitor offlineStop error for tx ${transactionId}:`, error.message);
    throw error;
  }
}

module.exports = { init, start, stop, checkAllActiveSessions };
