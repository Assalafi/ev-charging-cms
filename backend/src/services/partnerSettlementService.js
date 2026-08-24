const logger = require('../utils/logger');
const {
  PartnerCompany,
  PartnerSettlement,
  PartnerSettlementItem,
  Transaction,
  sequelize
} = require('../models');
const { Op, Transaction: SequelizeTransaction } = require('sequelize');

/**
 * Generate a settlement for a partner for a given period
 * 
 * @param {Object} params - Settlement generation parameters
 * @param {number} params.partnerId - Partner company ID
 * @param {string} params.periodType - 'weekly', 'monthly', 'yearly', or 'custom'
 * @param {Date} params.periodStart - Period start date
 * @param {Date} params.periodEnd - Period end date
 * @returns {Promise<Object>} Settlement result
 */
async function generateSettlement({ partnerId, periodType, periodStart, periodEnd }) {
  const allowedPeriodTypes = ['weekly', 'monthly', 'yearly', 'custom'];
  if (!allowedPeriodTypes.includes(periodType)) {
    return { success: false, message: 'Invalid settlement period type' };
  }
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date) ||
      Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) ||
      periodStart >= periodEnd) {
    return { success: false, message: 'Invalid settlement period' };
  }

  const partner = await PartnerCompany.findByPk(partnerId);
  if (!partner) {
    return { success: false, message: 'Partner not found' };
  }
  if (partner.status !== 'active') {
    return { success: false, message: 'Settlement generation is only available for active partners' };
  }

  const t = await sequelize.transaction({
    isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.SERIALIZABLE
  });

  try {
    // Check for duplicate settlement
    const existingSettlement = await PartnerSettlement.findOne({
      where: {
        partnerId,
        periodStart,
        periodEnd
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (existingSettlement && existingSettlement.status !== 'cancelled') {
      await t.rollback();
      return {
        success: false,
        message: `Settlement already exists for this period (${existingSettlement.id})`
      };
    }

    // Find all pending transactions for the partner in the period
    const candidates = await Transaction.findAll({
      where: {
        partnerId,
        status: 'Completed',
        billedAt: { [Op.ne]: null },
        settlementStatus: 'pending',
        stopTime: {
          [Op.gte]: periodStart,
          [Op.lte]: periodEnd
        }
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
      skipLocked: true
    });

    if (candidates.length === 0) {
      await t.rollback();
      return {
        success: false,
        code: 'NO_PENDING_TRANSACTIONS',
        message: `No billed, pending partner transactions were found between ${periodStart.toISOString()} and ${periodEnd.toISOString()}`
      };
    }

    const transactions = candidates.filter(transaction =>
      transaction.locationId != null &&
      transaction.sellingPricePerWh != null
    );
    const excludedSnapshotCount = candidates.length - transactions.length;
    if (transactions.length === 0) {
      await t.rollback();
      return {
        success: false,
        code: 'MISSING_REVENUE_SNAPSHOTS',
        message: `${excludedSnapshotCount} transaction(s) were found, but they predate complete partner revenue snapshots and cannot be settled safely. Correct the partner pricing/effective date or wait for completed partner transactions.`
      };
    }

    // Calculate totals
    const totals = transactions.reduce((acc, tx) => {
      return {
        totalTransactions: acc.totalTransactions + 1,
        totalEnergyWh: acc.totalEnergyWh + (parseFloat(tx.energyDelivered) || 0),
        grossAmount: acc.grossAmount + (parseFloat(tx.grossAmount) || parseFloat(tx.amount) || 0),
        productionCostAmount: acc.productionCostAmount + (parseFloat(tx.productionCostAmount) || 0),
        profitAmount: acc.profitAmount + (parseFloat(tx.profitAmount) || 0),
        partnerEarning: acc.partnerEarning + (parseFloat(tx.partnerEarning) || 0),
        companyEarning: acc.companyEarning + (parseFloat(tx.companyEarning) || 0)
      };
    }, {
      totalTransactions: 0,
      totalEnergyWh: 0,
      grossAmount: 0,
      productionCostAmount: 0,
      profitAmount: 0,
      partnerEarning: 0,
      companyEarning: 0
    });

    // Create settlement
    const settlementValues = {
      partnerId,
      periodType,
      periodStart,
      periodEnd,
      totalTransactions: totals.totalTransactions,
      totalEnergyWh: totals.totalEnergyWh,
      grossAmount: totals.grossAmount,
      productionCostAmount: totals.productionCostAmount,
      profitAmount: totals.profitAmount,
      partnerEarning: totals.partnerEarning,
      companyEarning: totals.companyEarning,
      adjustmentAmount: 0,
      finalPayableAmount: totals.partnerEarning,
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      paymentReference: null,
      paymentMethod: null,
      notes: null
    };
    let settlement;
    if (existingSettlement) {
      await PartnerSettlementItem.destroy({
        where: { settlementId: existingSettlement.id },
        transaction: t
      });
      await existingSettlement.update(settlementValues, { transaction: t });
      settlement = existingSettlement;
    } else {
      settlement = await PartnerSettlement.create(settlementValues, { transaction: t });
    }

    // Create settlement items for each transaction
    const settlementItems = await Promise.all(transactions.map(tx => {
      return PartnerSettlementItem.create({
        settlementId: settlement.id,
        transactionId: tx.id,
        chargePointId: tx.chargePointId,
        locationId: tx.locationId,
        energyWh: parseFloat(tx.energyDelivered),
        grossAmount: parseFloat(tx.grossAmount) || parseFloat(tx.amount) || 0,
        productionCostAmount: parseFloat(tx.productionCostAmount),
        profitAmount: parseFloat(tx.profitAmount),
        partnerEarning: parseFloat(tx.partnerEarning),
        companyEarning: parseFloat(tx.companyEarning)
      }, { transaction: t });
    }));

    // Update transaction settlement status
    await Transaction.update(
      { settlementStatus: 'included', settlementId: settlement.id },
      {
        where: {
          id: transactions.map(t => t.id)
        },
        transaction: t
      }
    );

    await t.commit();

    logger.info(`Settlement generated: ${settlement.id} for partner ${partnerId}, ${transactions.length} transactions`);

    return {
      success: true,
      message: 'Settlement generated successfully',
      settlement,
      items: settlementItems,
      excludedSnapshotCount
    };
  } catch (error) {
    await t.rollback();
    logger.error('Error generating settlement:', error);
    throw error;
  }
}

/**
 * Approve a settlement
 * 
 * @param {number} settlementId - Settlement ID
 * @param {number} approvedBy - User ID who is approving
 * @returns {Promise<Object>} Approval result
 */
async function approveSettlement(settlementId, approvedBy) {
  try {
    const settlement = await PartnerSettlement.findByPk(settlementId);

    if (!settlement) {
      return {
        success: false,
        message: 'Settlement not found'
      };
    }

    if (settlement.status !== 'draft') {
      return {
        success: false,
        message: `Cannot approve settlement with status: ${settlement.status}`
      };
    }

    await settlement.update({
      status: 'approved',
      approvedBy,
      approvedAt: new Date()
    });

    logger.info(`Settlement approved: ${settlementId} by user ${approvedBy}`);

    return {
      success: true,
      message: 'Settlement approved successfully',
      settlement
    };
  } catch (error) {
    logger.error('Error approving settlement:', error);
    throw error;
  }
}

/**
 * Mark a settlement as paid
 * 
 * @param {number} settlementId - Settlement ID
 * @param {number} paidBy - User ID who is marking as paid
 * @param {Object} paymentDetails - Payment details
 * @returns {Promise<Object>} Payment result
 */
async function markSettlementPaid(settlementId, paidBy, paymentDetails) {
  const t = await sequelize.transaction();
  try {
    const settlement = await PartnerSettlement.findByPk(settlementId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!settlement) {
      await t.rollback();
      return {
        success: false,
        message: 'Settlement not found'
      };
    }

    if (settlement.status !== 'approved') {
      await t.rollback();
      return {
        success: false,
        message: `Cannot mark as paid settlement with status: ${settlement.status}`
      };
    }

    await settlement.update({
      status: 'paid',
      paidBy,
      paidAt: new Date(),
      paymentReference: paymentDetails.paymentReference,
      paymentMethod: paymentDetails.paymentMethod,
      notes: paymentDetails.notes
    }, { transaction: t });

    // Update transaction settlement status to paid
    await Transaction.update(
      { settlementStatus: 'paid' },
      {
        where: { settlementId },
        transaction: t
      }
    );
    await t.commit();

    logger.info(`Settlement marked as paid: ${settlementId} by user ${paidBy}`);

    return {
      success: true,
      message: 'Settlement marked as paid successfully',
      settlement
    };
  } catch (error) {
    try { await t.rollback(); } catch (_) {}
    logger.error('Error marking settlement as paid:', error);
    throw error;
  }
}

/**
 * Cancel a settlement
 * 
 * @param {number} settlementId - Settlement ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancellation result
 */
async function cancelSettlement(settlementId, reason) {
  const t = await sequelize.transaction();
  try {
    const settlement = await PartnerSettlement.findByPk(settlementId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!settlement) {
      await t.rollback();
      return {
        success: false,
        message: 'Settlement not found'
      };
    }

    if (settlement.status === 'paid') {
      await t.rollback();
      return {
        success: false,
        message: 'Cannot cancel a paid settlement'
      };
    }

    // Reset transaction settlement status
    await Transaction.update(
      { settlementStatus: 'pending', settlementId: null },
      {
        where: { settlementId },
        transaction: t
      }
    );

    await settlement.update({
      status: 'cancelled',
      notes: (settlement.notes || '') + `\n\nCancelled: ${reason}`
    }, { transaction: t });
    await t.commit();

    logger.info(`Settlement cancelled: ${settlementId}`);

    return {
      success: true,
      message: 'Settlement cancelled successfully',
      settlement
    };
  } catch (error) {
    try { await t.rollback(); } catch (_) {}
    logger.error('Error cancelling settlement:', error);
    throw error;
  }
}

module.exports = {
  generateSettlement,
  approveSettlement,
  markSettlementPaid,
  cancelSettlement
};
