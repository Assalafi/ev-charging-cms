const logger = require('../utils/logger');
const { PartnerSettlement, PartnerSettlementItem, Transaction, sequelize } = require('../models');

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
  const t = await sequelize.transaction();

  try {
    // Check for duplicate settlement
    const existingSettlement = await PartnerSettlement.findOne({
      where: {
        partnerId,
        periodStart,
        periodEnd,
        status: { [require('sequelize').Op.ne]: 'cancelled' }
      },
      transaction: t
    });

    if (existingSettlement) {
      await t.rollback();
      return {
        success: false,
        message: `Settlement already exists for this period (${existingSettlement.id})`
      };
    }

    // Find all pending transactions for the partner in the period
    const transactions = await Transaction.findAll({
      where: {
        partnerId,
        status: 'Completed',
        settlementStatus: 'pending',
        stopTime: {
          [require('sequelize').Op.gte]: periodStart,
          [require('sequelize').Op.lte]: periodEnd
        }
      },
      transaction: t
    });

    if (transactions.length === 0) {
      await t.rollback();
      return {
        success: false,
        message: 'No pending transactions found for this period'
      };
    }

    // Calculate totals
    const totals = transactions.reduce((acc, tx) => {
      return {
        totalTransactions: acc.totalTransactions + 1,
        totalEnergyWh: acc.totalEnergyWh + (parseFloat(tx.energyDelivered) || 0),
        grossAmount: acc.grossAmount + (parseFloat(tx.amount) || 0),
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
    const settlement = await PartnerSettlement.create({
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
      status: 'draft'
    }, { transaction: t });

    // Create settlement items for each transaction
    const settlementItems = await Promise.all(transactions.map(tx => {
      return PartnerSettlementItem.create({
        settlementId: settlement.id,
        transactionId: tx.id,
        chargePointId: tx.chargePointId,
        locationId: tx.locationId,
        energyWh: parseFloat(tx.energyDelivered),
        grossAmount: parseFloat(tx.amount),
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
      items: settlementItems
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
  try {
    const settlement = await PartnerSettlement.findByPk(settlementId);

    if (!settlement) {
      return {
        success: false,
        message: 'Settlement not found'
      };
    }

    if (settlement.status !== 'approved') {
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
    });

    // Update transaction settlement status to paid
    await Transaction.update(
      { settlementStatus: 'paid' },
      {
        where: { settlementId }
      }
    );

    logger.info(`Settlement marked as paid: ${settlementId} by user ${paidBy}`);

    return {
      success: true,
      message: 'Settlement marked as paid successfully',
      settlement
    };
  } catch (error) {
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
  try {
    const settlement = await PartnerSettlement.findByPk(settlementId);

    if (!settlement) {
      return {
        success: false,
        message: 'Settlement not found'
      };
    }

    if (settlement.status === 'paid') {
      return {
        success: false,
        message: 'Cannot cancel a paid settlement'
      };
    }

    // Reset transaction settlement status
    await Transaction.update(
      { settlementStatus: 'pending', settlementId: null },
      {
        where: { settlementId }
      }
    );

    await settlement.update({
      status: 'cancelled',
      notes: (settlement.notes || '') + `\n\nCancelled: ${reason}`
    });

    logger.info(`Settlement cancelled: ${settlementId}`);

    return {
      success: true,
      message: 'Settlement cancelled successfully',
      settlement
    };
  } catch (error) {
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
