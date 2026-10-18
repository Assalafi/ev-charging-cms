/**
 * Durable recovery for transactions whose charge point lost its OCPP socket.
 *
 * The old implementation kept the only timeout in memory. This worker uses
 * persisted transaction.updatedAt/offlineSince values, so a backend restart
 * cannot permanently strand an active session.
 */
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const {
  Transaction,
  ChargingStation,
  Connector
} = require('../models');
const { getChargingPricing } = require('./chargingPricingService');
const { calculatePartnerRevenue } = require('./partnerRevenueService');
const { billTransaction } = require('./billingService');

const OFFLINE_GRACE_MS = Number.parseInt(process.env.OCPP_OFFLINE_GRACE_MS || '120000', 10);
const RECOVERY_INTERVAL_MS = Number.parseInt(process.env.OCPP_RECOVERY_INTERVAL_MS || '30000', 10);

let intervalHandle = null;
let running = false;
let isConnected = () => false;

function configure({ connectionChecker } = {}) {
  if (typeof connectionChecker === 'function') {
    isConnected = connectionChecker;
  }
}

async function markStationOffline(chargePointId, at = new Date()) {
  if (!chargePointId) return;
  try {
    await Transaction.update(
      { offlineSince: at },
      {
        where: {
          chargePointId,
          status: 'InProgress',
          offlineSince: null
        }
      }
    );
  } catch (error) {
    logger.warn(`Could not persist offline marker for ${chargePointId}: ${error.message}`);
  }
}

async function markStationOnline(chargePointId) {
  if (!chargePointId) return;
  try {
    await Transaction.update(
      { offlineSince: null },
      { where: { chargePointId, status: 'InProgress' } }
    );
  } catch (error) {
    logger.warn(`Could not clear offline marker for ${chargePointId}: ${error.message}`);
  }
}

function calculateFallbackAmount(transaction, pricing) {
  const energyWh = Math.max(0, Number(transaction.energyDelivered) || 0);
  const rawAmount = (energyWh / 1000) * pricing.pricePerWh * 1000;
  return {
    energyWh,
    amount: Math.max(rawAmount, pricing.minimumCharge),
    grossAmount: rawAmount
  };
}

async function completeOfflineTransaction(
  transaction,
  at = new Date(),
  { reason = 'NetworkDisconnected', stopReason = null } = {}
) {
  const current = await Transaction.findOne({
    where: { transactionId: transaction.transactionId, status: 'InProgress' }
  });
  if (!current) return { completed: false, reason: 'already handled' };

  const pricing = await getChargingPricing({
    chargePointId: current.chargePointId,
    idTag: current.idTag
  });
  const calculation = calculateFallbackAmount(current, pricing);
  const stopMeterValue = Math.max(
    Number(current.stopMeterValue) || 0,
    (Number(current.startMeterValue) || 0) + calculation.energyWh
  );
  const revenue = await calculatePartnerRevenue({
    chargePointId: current.chargePointId,
    energyWh: calculation.energyWh,
    billableAmount: calculation.amount,
    idTag: current.idTag,
    pricing
  });

  // Conditional update prevents a simultaneous real StopTransaction from
  // being overwritten by this fallback.
  const [updated] = await Transaction.update(
    {
      status: 'Completed',
      stopTime: at,
      stopMeterValue,
      energyDelivered: calculation.energyWh,
      amount: calculation.amount,
      grossAmount: revenue.grossAmount ?? calculation.grossAmount,
      reason,
      stopReason,
      offlineSince: current.offlineSince || at,
      sellingPricePerWh: revenue.sellingPricePerWh,
      productionCostPerWh: revenue.productionCostPerWh,
      partnerSharePercent: revenue.partnerSharePercent,
      minimumChargeApplied: calculation.grossAmount < calculation.amount,
      productionCostAmount: revenue.productionCostAmount,
      profitAmount: revenue.profitAmount,
      partnerEarning: revenue.partnerEarning,
      companyEarning: revenue.companyEarning,
      partnerId: revenue.partnerId,
      locationId: revenue.locationId,
      settlementStatus: revenue.settlementStatus
    },
    {
      where: {
        transactionId: current.transactionId,
        status: 'InProgress'
      }
    }
  );

  if (!updated) return { completed: false, reason: 'handled concurrently' };

  const remainingActive = await Transaction.findAll({
    where: { chargePointId: current.chargePointId, status: 'InProgress' },
    attributes: ['transactionId', 'connectorId'],
    order: [['createdAt', 'DESC']],
    limit: 100
  });
  const remainingOnConnector = remainingActive.find(
    candidate => candidate.connectorId === current.connectorId
  );
  const statusUpdates = [Connector.update(
    remainingOnConnector
      ? { status: 'Charging', transactionId: remainingOnConnector.transactionId }
      : { status: 'Available', transactionId: null },
    { where: { chargePointId: current.chargePointId, connectorId: current.connectorId } }
  )];
  statusUpdates.push(ChargingStation.update(
    remainingActive.length > 0
      ? { status: 'Charging', currentTransaction: remainingActive[0].transactionId }
      : { status: 'Available', currentTransaction: null },
    { where: { chargePointId: current.chargePointId } }
  ));
  await Promise.allSettled(statusUpdates);

  const billing = await billTransaction(current.transactionId);
  if (!billing.success) {
    logger.warn(
      `Offline recovery completed tx ${current.transactionId}, billing queued: ${billing.message}`
    );
  }

  return {
    completed: true,
    transactionId: current.transactionId,
    billing
  };
}

async function recoverOfflineTransactions({ chargePointId, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - OFFLINE_GRACE_MS);
  const where = {
    status: 'InProgress',
    [Op.or]: [
      { offlineSince: { [Op.lte]: cutoff } },
      {
        offlineSince: null,
        updatedAt: { [Op.lte]: cutoff }
      }
    ]
  };
  if (chargePointId) where.chargePointId = chargePointId;

  const transactions = await Transaction.findAll({
    where,
    order: [['updatedAt', 'ASC']],
    limit: 100
  });

  let recovered = 0;
  for (const transaction of transactions) {
    if (isConnected(transaction.chargePointId)) continue;
    try {
      const result = await completeOfflineTransaction(transaction, now);
      if (result.completed) recovered += 1;
    } catch (error) {
      logger.error(`Offline recovery failed for tx ${transaction.transactionId}: ${error.message}`);
    }
  }
  return { inspected: transactions.length, recovered };
}

async function run() {
  if (running) return;
  running = true;
  try {
    const result = await recoverOfflineTransactions();
    if (result.recovered) {
      logger.info(`Offline transaction recovery completed ${result.recovered} session(s)`);
    }
  } catch (error) {
    logger.error(`Offline transaction recovery run failed: ${error.message}`);
  } finally {
    running = false;
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(run, RECOVERY_INTERVAL_MS);
  setTimeout(run, 5000);
  logger.info(`Offline transaction recovery started (every ${RECOVERY_INTERVAL_MS / 1000}s)`);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  configure,
  start,
  stop,
  markStationOffline,
  markStationOnline,
  recoverOfflineTransactions,
  completeOfflineTransaction
};
