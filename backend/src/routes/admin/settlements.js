const express = require('express');
const router = express.Router();
const { PartnerSettlement, PartnerSettlementItem, PartnerCompany, Transaction, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { generateSettlement, approveSettlement, markSettlementPaid, cancelSettlement } = require('../../services/partnerSettlementService');
const logger = require('../../utils/logger');

/**
 * @route   GET /api/admin/settlements
 * @desc    Get all settlements with filtering
 * @access  Private (admin)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, partnerId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    if (partnerId && partnerId !== 'all') {
      whereClause.partnerId = partnerId;
    }

    const { count, rows: settlements } = await PartnerSettlement.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: PartnerCompany,
          as: 'partner',
          attributes: ['id', 'name', 'businessName']
        }
      ],
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
    logger.error('Error fetching settlements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/partners/:partnerId/settlements/generate
 * @desc    Generate a settlement for a partner
 * @access  Private (admin)
 */
router.post('/partners/:partnerId/settlements/generate', authenticate, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { periodType, periodStart, periodEnd } = req.body;

    if (!periodType || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: periodType, periodStart, periodEnd'
      });
    }

    const result = await generateSettlement({
      partnerId: parseInt(partnerId),
      periodType,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd)
    });

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error generating settlement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate settlement: ' + error.message
    });
  }
});

/**
 * @route   GET /api/admin/settlements/:id
 * @desc    Get settlement details with items
 * @access  Private (admin)
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const settlement = await PartnerSettlement.findByPk(id, {
      include: [
        {
          model: PartnerCompany,
          as: 'partner',
          attributes: ['id', 'name', 'businessName', 'contactEmail', 'contactPhone', 'bankName', 'bankAccountName', 'bankAccountNumber']
        },
        {
          model: PartnerSettlementItem,
          as: 'items',
          include: [{
            model: Transaction,
            as: 'transaction',
            attributes: ['transactionId', 'chargePointId', 'idTag', 'stopTime', 'energyDelivered', 'amount', 'partnerEarning']
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

/**
 * @route   POST /api/admin/settlements/:id/approve
 * @desc    Approve a settlement
 * @access  Private (admin)
 */
router.post('/:id/approve', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const approvedBy = req.user.id;

    const result = await approveSettlement(parseInt(id), approvedBy);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error approving settlement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve settlement: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/settlements/:id/mark-paid
 * @desc    Mark a settlement as paid
 * @access  Private (admin)
 */
router.post('/:id/mark-paid', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod, notes } = req.body;
    const paidBy = req.user.id;

    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: paymentReference'
      });
    }

    const result = await markSettlementPaid(parseInt(id), paidBy, {
      paymentReference,
      paymentMethod,
      notes
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error marking settlement as paid:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark settlement as paid: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/settlements/:id/cancel
 * @desc    Cancel a settlement
 * @access  Private (admin)
 */
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: reason'
      });
    }

    const result = await cancelSettlement(parseInt(id), reason);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error cancelling settlement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel settlement: ' + error.message
    });
  }
});

module.exports = router;
