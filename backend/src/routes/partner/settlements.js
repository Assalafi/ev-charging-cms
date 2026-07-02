const express = require('express');
const router = express.Router();
const { PartnerSettlement, PartnerSettlementItem, Transaction } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const logger = require('../../utils/logger');

/**
 * @route   GET /api/partner/settlements
 * @desc    Get all settlements for the partner
 * @access  Private (partner)
 */
router.get('/', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { partnerId };
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    const { count, rows: settlements } = await PartnerSettlement.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['periodEnd', 'DESC']]
    });

    res.json({
      success: true,
      settlements,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching partner settlements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/settlements/:id
 * @desc    Get settlement details with items
 * @access  Private (partner)
 */
router.get('/:id', authenticate, partnerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.partnerId;

    const settlement = await PartnerSettlement.findOne({
      where: { id, partnerId },
      include: [
        {
          model: PartnerSettlementItem,
          as: 'items',
          include: [{
            model: Transaction,
            as: 'transaction',
            attributes: ['transactionId', 'chargePointId', 'idTag', 'stopTime', 'energyDelivered', 'amount']
          }]
        }
      ]
    });

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    res.json({
      success: true,
      settlement
    });
  } catch (error) {
    logger.error('Error fetching settlement details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement details: ' + error.message
    });
  }
});

module.exports = router;
