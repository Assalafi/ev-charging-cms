const { calculatePartnerRevenue } = require('./partnerRevenueService');

async function buildCompletionSnapshot(transaction, reason) {
  const energyWh = Math.max(Number(transaction.energyDelivered) || 0, 0);
  const revenue = await calculatePartnerRevenue({
    chargePointId: transaction.chargePointId,
    energyWh,
    billableAmount: Number(transaction.amount) || 0
  });

  return {
    status: 'Completed',
    stopTime: transaction.stopTime || new Date(),
    stopReason: reason,
    reason,
    amount: revenue.billableAmount,
    grossAmount: revenue.grossAmount,
    sellingPricePerWh: revenue.sellingPricePerWh,
    productionCostPerWh: revenue.productionCostPerWh,
    partnerSharePercent: revenue.partnerSharePercent,
    minimumChargeApplied: revenue.minimumChargeApplied,
    productionCostAmount: revenue.productionCostAmount,
    profitAmount: revenue.profitAmount,
    partnerEarning: revenue.partnerEarning,
    companyEarning: revenue.companyEarning,
    partnerId: revenue.partnerId,
    locationId: revenue.locationId,
    settlementStatus: revenue.settlementStatus
  };
}

async function completeTransaction(transaction, reason = 'Manually completed due to error') {
  const snapshot = await buildCompletionSnapshot(transaction, reason);
  await transaction.update(snapshot);
  return transaction;
}

module.exports = { buildCompletionSnapshot, completeTransaction };
