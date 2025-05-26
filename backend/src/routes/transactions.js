const express = require('express');
const { Transaction, ChargingStation, MeterValue, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions with pagination
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      status, 
      chargePointId, 
      idTag,
      startDate,
      endDate,
      sort = 'startTime',
      order = 'DESC'
    } = req.query;
    
    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (chargePointId) where.chargePointId = chargePointId;
    if (idTag) where.idTag = idTag;
    
    // Date filters
    if (startDate) {
      where.startTime = {
        ...where.startTime,
        [sequelize.Op.gte]: new Date(startDate)
      };
    }
    
    if (endDate) {
      where.startTime = {
        ...where.startTime,
        [sequelize.Op.lte]: new Date(endDate)
      };
    }
    
    // Execute query
    const transactions = await Transaction.findAndCountAll({
      where,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: ChargingStation,
          attributes: ['name', 'model', 'vendor']
        }
      ]
    });
    
    res.json({
      success: true,
      count: transactions.count,
      transactions: transactions.rows
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions'
    });
  }
});

/**
 * @route   GET /api/transactions/:id
 * @desc    Get a single transaction by transaction ID
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      where: { transactionId: req.params.id },
      include: [
        {
          model: ChargingStation,
          attributes: ['name', 'model', 'vendor']
        }
      ]
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    // Get meter values for this transaction
    const meterValues = await MeterValue.findAll({
      where: { transactionId: transaction.transactionId },
      order: [['timestamp', 'ASC']]
    });
    
    res.json({
      success: true,
      transaction,
      meterValues
    });
  } catch (error) {
    logger.error(`Error fetching transaction ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction'
    });
  }
});

/**
 * @route   GET /api/transactions/stats/energy
 * @desc    Get energy consumption statistics
 * @access  Private
 */
router.get('/stats/energy', authenticate, async (req, res) => {
  try {
    const { period = 'day', chargePointId } = req.query;
    
    let timeGroup, startDate;
    const now = new Date();
    
    // Set time grouping and start date based on period
    switch (period) {
      case 'day':
        timeGroup = 'hour';
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        timeGroup = 'day';
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        timeGroup = 'day';
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        timeGroup = 'hour';
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
    }
    
    // Build where clause with error handling
    let transactions = [];
    try {
      // Build where clause
      const where = {
        stopTime: { [sequelize.Op.gte]: startDate }
      };
      
      if (chargePointId) {
        where.chargePointId = chargePointId;
      }
      
      // Get completed transactions with error handling
      transactions = await Transaction.findAll({
        where,
        attributes: [
          'stopTime',
          'energyDelivered'
        ],
        order: [['stopTime', 'ASC']]
      }) || [];
    } catch (error) {
      logger.error('Error querying transactions for energy stats:', error);
      // Continue with empty transactions array rather than failing
      transactions = [];
    }
    
    // Process data for time-based grouping
    const energyData = {};
    
    // Only process if we have transactions
    if (Array.isArray(transactions)) {
      transactions.forEach(transaction => {
        try {
          if (!transaction || !transaction.stopTime) return;
          
          let key;
          const date = new Date(transaction.stopTime);
          
          if (isNaN(date.getTime())) return; // Skip invalid dates
          
          switch (timeGroup) {
            case 'hour':
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
              break;
            case 'day':
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              break;
            default:
              return; // Skip if timeGroup is invalid
          }
          
          if (!energyData[key]) {
            energyData[key] = 0;
          }
          
          const energy = parseFloat(transaction.energyDelivered || 0);
          if (!isNaN(energy)) {
            energyData[key] += energy;
          }
        } catch (error) {
          logger.error('Error processing transaction for energy stats:', error);
          // Continue processing other transactions
        }
      });
    }
    
    // Convert to array format for frontend with error handling
    let energyStats = [];
    try {
      energyStats = Object.keys(energyData).map(key => ({
        timestamp: key,
        energy: parseFloat((energyData[key] || 0).toFixed(2))
      }));
    } catch (error) {
      logger.error('Error formatting energy stats for response:', error);
      // Return empty array if formatting fails
      energyStats = [];
    }
    
    res.json({
      success: true,
      period,
      energyStats
    });
  } catch (error) {
    logger.error('Error fetching energy statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve energy statistics'
    });
  }
});

/**
 * @route   GET /api/transactions/stats/usage
 * @desc    Get station usage statistics
 * @access  Private
 */
router.get('/stats/usage', authenticate, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate;
    const now = new Date();
    
    // Set start date based on period
    switch (period) {
      case 'day':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
    }
    
    // Get transaction count per station with error handling
    let stationUsage = [];
    try {
      stationUsage = await Transaction.findAll({
        where: {
          startTime: { [sequelize.Op.gte]: startDate }
        },
        attributes: [
          'chargePointId',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('energyDelivered')), 'totalEnergy']
        ],
        include: [
          {
            model: ChargingStation,
            attributes: ['name'],
            required: false // Use left join to include transactions even if station is deleted
          }
        ],
        group: ['chargePointId', 'charging_station.id'],
        order: [[sequelize.literal('count'), 'DESC']]
      }) || [];
    } catch (error) {
      // Log error but don't fail the request
      logger.error('Error querying station usage statistics:', error);
      
      // Try a simplified query if the complex one fails
      try {
        stationUsage = await Transaction.findAll({
          where: {
            startTime: { [sequelize.Op.gte]: startDate }
          },
          attributes: [
            'chargePointId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['chargePointId'],
          order: [[sequelize.literal('count'), 'DESC']]
        }) || [];
      } catch (fallbackError) {
        logger.error('Error in fallback query for station usage:', fallbackError);
        // Continue with empty array
      }
    }
    
    res.json({
      success: true,
      period,
      stationUsage
    });
  } catch (error) {
    logger.error('Error fetching station usage statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve usage statistics'
    });
  }
});

module.exports = router;
