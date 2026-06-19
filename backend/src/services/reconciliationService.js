/**
 * Reconciliation Service — Align station and system transaction records
 * 
 * Compares transactions from the system database with charger records
 * (via OCPP GetTransactionList if supported) to detect and fix discrepancies.
 * 
 * Use cases:
 * - Daily reconciliation to catch billing discrepancies
 * - Post-network-drop validation
 * - Audit trail verification
 */

const logger = require('../utils/logger');
const { Transaction, ChargingStation, sequelize } = require('../models');
const { Op } = require('sequelize');
const ocppServer = require('../ocpp/server');

/**
 * Reconcile transactions for a specific station within a date range
 * 
 * @param {string} chargePointId - Station ID
 * @param {Date} startDate - Start date for reconciliation
 * @param {Date} endDate - End date for reconciliation
 * @param {boolean} autoCorrect - Whether to auto-correct discrepancies
 * @returns {object} Reconciliation report
 */
async function reconcileStation(chargePointId, startDate, endDate, autoCorrect = false) {
  const report = {
    chargePointId,
    startDate,
    endDate,
    totalSystemTransactions: 0,
    totalChargerTransactions: 0,
    matched: 0,
    amountMismatches: [],
    energyMismatches: [],
    missingInSystem: [],
    missingInCharger: [],
    corrections: []
  };

  try {
    // 1. Fetch system transactions for the date range
    const systemTxs = await Transaction.findAll({
      where: {
        chargePointId,
        startTime: { [Op.gte]: startDate },
        stopTime: { [Op.lte]: endDate }
      },
      order: [['startTime', 'ASC']]
    });

    report.totalSystemTransactions = systemTxs.length;
    logger.info(`Found ${systemTxs.length} system transactions for ${chargePointId} in date range`);

    // 2. Try to fetch charger transactions via OCPP GetTransactionList
    let chargerTxs = [];
    if (ocppServer.isConnected(chargePointId)) {
      try {
        const requestId = Date.now();
        const response = await ocppServer.sendOcppRequest(
          chargePointId,
          'GetTransactionList',
          {
            requestId,
            occurrence: 'newest',
            status: 'Accepted'
          }
        );
        
        if (response && response.transactionData) {
          chargerTxs = response.transactionData;
          report.totalChargerTransactions = chargerTxs.length;
          logger.info(`Found ${chargerTxs.length} charger transactions for ${chargePointId}`);
        }
      } catch (ocppErr) {
        logger.warn(`GetTransactionList not supported or failed for ${chargePointId}: ${ocppErr.message}`);
      }
    } else {
      logger.warn(`Station ${chargePointId} not connected — cannot fetch charger transactions`);
    }

    // 3. Create maps for easy lookup
    const systemMap = new Map();
    systemTxs.forEach(tx => {
      systemMap.set(tx.transactionId.toString(), tx);
    });

    const chargerMap = new Map();
    chargerTxs.forEach(tx => {
      chargerMap.set(tx.transactionId.toString(), tx);
    });

    // 4. Compare transactions
    // Check system transactions against charger
    for (const [txId, systemTx] of systemMap) {
      const chargerTx = chargerMap.get(txId);

      if (!chargerTx) {
        // Transaction in system but not in charger
        report.missingInCharger.push({
          transactionId: txId,
          systemAmount: parseFloat(systemTx.amount) || 0,
          systemEnergy: parseFloat(systemTx.energyDelivered) || 0,
          stopTime: systemTx.stopTime
        });
        continue;
      }

      // Compare amounts
      const systemAmount = parseFloat(systemTx.amount) || 0;
      const chargerEnergy = parseFloat(chargerTx.energy) || 0;
      const systemEnergy = parseFloat(systemTx.energyDelivered) || 0;

      // Calculate expected amount from charger energy
      let expectedAmount = 0;
      try {
        const station = await ChargingStation.findOne({
          where: { chargePointId },
          attributes: ['locationId']
        });
        if (station && station.locationId) {
          const Location = require('../models').Location;
          const location = await Location.findByPk(station.locationId);
          if (location) {
            const pricePerWh = location.pricePerWh || 0.4;
            const minimumCharge = location.minimumCharge || 150;
            const energyInKwh = chargerEnergy > 100 ? chargerEnergy / 1000 : chargerEnergy;
            const ratePerKwh = pricePerWh * 1000;
            expectedAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge);
          }
        }
      } catch (priceErr) {
        logger.error(`Price calc error for tx ${txId}: ${priceErr.message}`);
      }

      const amountDiff = Math.abs(systemAmount - expectedAmount);

      if (amountDiff > 1) {
        report.amountMismatches.push({
          transactionId: txId,
          systemAmount,
          chargerEnergy,
          expectedAmount,
          difference: amountDiff,
          chargerData: chargerTx
        });

        if (autoCorrect && systemTx.billedAt) {
          // Auto-correct wallet
          await correctWalletDifference(systemTx, systemAmount, expectedAmount);
          report.corrections.push({
            transactionId: txId,
            previousAmount: systemAmount,
            correctedAmount: expectedAmount,
            difference: expectedAmount - systemAmount
          });
        }
      }

      // Compare energy
      const energyDiff = Math.abs(systemEnergy - chargerEnergy);
      if (energyDiff > 100) { // More than 100Wh difference
        report.energyMismatches.push({
          transactionId: txId,
          systemEnergy,
          chargerEnergy,
          difference: energyDiff
        });

        if (autoCorrect) {
          await systemTx.update({
            energyDelivered: chargerEnergy,
            stopMeterValue: chargerTx.meterStop || systemTx.stopMeterValue
          });
          report.corrections.push({
            transactionId: txId,
            field: 'energy',
            previousValue: systemEnergy,
            correctedValue: chargerEnergy
          });
        }
      }

      report.matched++;
    }

    // Check charger transactions not in system
    for (const [txId, chargerTx] of chargerMap) {
      if (!systemMap.has(txId)) {
        report.missingInSystem.push({
          transactionId: txId,
          chargerEnergy: parseFloat(chargerTx.energy) || 0,
          chargerTimestamp: chargerTx.timestamp,
          idTag: chargerTx.idTag
        });
      }
    }

    logger.info(
      `Reconciliation complete for ${chargePointId}: ` +
      `${report.matched} matched, ` +
      `${report.amountMismatches.length} amount mismatches, ` +
      `${report.energyMismatches.length} energy mismatches, ` +
      `${report.missingInSystem.length} missing in system, ` +
      `${report.missingInCharger.length} missing in charger`
    );

    return report;

  } catch (error) {
    logger.error(`Reconciliation error for ${chargePointId}: ${error.message}`, error);
    throw error;
  }
}

/**
 * Reconcile all stations for the last 3 days
 * 
 * @param {boolean} autoCorrect - Whether to auto-correct discrepancies
 * @returns {object} Overall reconciliation report
 */
async function reconcileAllStations(autoCorrect = false) {
  logger.info('Starting reconciliation for all stations (last 3 days)');

  const overallReport = {
    startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    stations: [],
    summary: {
      totalStations: 0,
      totalMismatches: 0,
      totalCorrections: 0
    }
  };

  try {
    const stations = await ChargingStation.findAll({
      attributes: ['chargePointId'],
      where: { status: { [sequelize.Op.in]: ['Available', 'Charging', 'Preparing'] } }
    });

    overallReport.summary.totalStations = stations.length;

    for (const station of stations) {
      try {
        const stationReport = await reconcileStation(
          station.chargePointId,
          overallReport.startDate,
          overallReport.endDate,
          autoCorrect
        );
        overallReport.stations.push(stationReport);
        overallReport.summary.totalMismatches += 
          stationReport.amountMismatches.length + 
          stationReport.energyMismatches.length;
        overallReport.summary.totalCorrections += stationReport.corrections.length;
      } catch (err) {
        logger.error(`Failed to reconcile station ${station.chargePointId}: ${err.message}`);
      }
    }

    logger.info(
      `All stations reconciliation complete: ` +
      `${overallReport.summary.totalStations} stations, ` +
      `${overallReport.summary.totalMismatches} mismatches, ` +
      `${overallReport.summary.totalCorrections} corrections`
    );

    return overallReport;

  } catch (error) {
    logger.error(`Reconciliation error: ${error.message}`, error);
    throw error;
  }
}

/**
 * Correct wallet difference for a transaction
 * 
 * @param {Transaction} transaction - The transaction to correct
 * @param {number} billedAmount - Amount that was billed
 * @param {number} correctAmount - Correct amount that should have been billed
 */
async function correctWalletDifference(transaction, billedAmount, correctAmount) {
  try {
    const { MobileUser, Wallet, PaymentTransaction } = require('../models');
    const difference = correctAmount - billedAmount;

    if (Math.abs(difference) < 1) return; // Too small to correct

    const user = await MobileUser.findOne({ where: { tagId: transaction.idTag } });
    if (!user) {
      logger.warn(`Cannot correct wallet: user not found for idTag ${transaction.idTag}`);
      return;
    }

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (!wallet) {
      logger.warn(`Cannot correct wallet: wallet not found for user ${user.id}`);
      return;
    }

    const currentBalance = parseFloat(wallet.balance);
    const newBalance = currentBalance - difference;
    await wallet.update({ balance: newBalance });

    await PaymentTransaction.create({
      userId: user.id,
      walletId: wallet.id,
      type: difference > 0 ? 'DEBIT' : 'CREDIT',
      amount: Math.abs(difference),
      currency: 'NGN',
      reference: `RECONCILE-${transaction.transactionId}-${Date.now()}`,
      gateway: 'internal',
      status: 'SUCCESS',
      description: `Reconciliation correction for tx ${transaction.transactionId}`,
      metadata: {
        transactionId: transaction.transactionId,
        chargePointId: transaction.chargePointId,
        billedAmount,
        correctAmount,
        difference,
        previousBalance: currentBalance,
        newBalance: newBalance
      }
    });

    await transaction.update({
      amount: correctAmount
    });

    logger.info(
      `Wallet corrected for tx ${transaction.transactionId}: ` +
      `${difference > 0 ? 'Charged' : 'Refunded'} ₦${Math.abs(difference).toFixed(2)}. ` +
      `User ${user.email} balance: ₦${currentBalance.toFixed(2)}→₦${newBalance.toFixed(2)}`
    );

  } catch (error) {
    logger.error(`Wallet correction error for tx ${transaction.transactionId}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  reconcileStation,
  reconcileAllStations,
  correctWalletDifference
};
