const express = require('express');
const { Transaction, ChargingStation, MeterValue, sequelize, Location, Wallet, MobileUser, PaymentTransaction } = require('../models');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Health check endpoints - must be defined before authentication middleware
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();
    
    // Check if tables exist using the correct table names from schema
    const [results] = await sequelize.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name IN ('transactions', 'charging_stations')`
    );
    
    const tables = results.map(r => r.table_name);
    logger.debug('Found tables:', tables);
    
    // Check if we can query the tables
    try {
      await Transaction.count();
      await ChargingStation.count();
    } catch (error) {
      logger.error('Error querying tables:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error querying database tables',
        error: error.message
      });
    }
    
    // Check if there are any transactions
    const transactionCount = await Transaction.count();
    
    res.json({
      status: 'ok',
      database: 'connected',
      tables: {
        transactions: { exists: true, count: transactionCount },
        charging_stations: { exists: true }
      },
      env: process.env.NODE_ENV || 'development'
    });
    
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Schema check endpoint
router.get('/schema-check', async (req, res) => {
  try {
    // Get transactions table structure
    const [transactionColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'transactions'
      ORDER BY ordinal_position
    `);
    
    // Get charging_stations table structure
    const [stationColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'charging_stations'
      ORDER BY ordinal_position
    `);
    
    // Get foreign key relationships
    const [foreignKeys] = await sequelize.query(`
      SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (tc.table_name = 'transactions' OR tc.table_name = 'charging_stations')
    `);
    
    res.json({
      status: 'ok',
      tables: {
        transactions: {
          columns: transactionColumns,
          rowCount: await Transaction.count()
        },
        charging_stations: {
          columns: stationColumns,
          rowCount: await ChargingStation.count()
        }
      },
      foreignKeys
    });
    
  } catch (error) {
    logger.error('Schema check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Schema check failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Apply authentication middleware to all routes below this line
router.use(authenticate);



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
    
    // Date filters with enhanced logging
    if (startDate || endDate) {
      where.startTime = {};
      
      if (startDate) {
        try {
          const start = new Date(startDate);
          if (!isNaN(start.getTime())) {
            where.startTime[Op.gte] = start;
            logger.debug(`Filtering transactions after: ${start.toISOString()}`);
          } else {
            logger.warn(`Invalid startDate format: ${startDate}`);
          }
        } catch (error) {
          logger.error(`Error parsing startDate ${startDate}:`, error);
        }
      }
      
      if (endDate) {
        try {
          const end = new Date(endDate);
          if (!isNaN(end.getTime())) {
            // Add one day to include the entire end date
            end.setDate(end.getDate() + 1);
            where.startTime[Op.lt] = end; // Use lt (less than) instead of lte
            logger.debug(`Filtering transactions before: ${end.toISOString()}`);
          } else {
            logger.warn(`Invalid endDate format: ${endDate}`);
          }
        } catch (error) {
          logger.error(`Error parsing endDate ${endDate}:`, error);
        }
      }
      
      // If no valid dates were set, remove the startTime condition
      if (Object.keys(where.startTime).length === 0) {
        delete where.startTime;
      }
    }
    
    // Log the complete where clause
    logger.debug('Final query where clause:', JSON.stringify(where, null, 2));
    
    // Execute query
    let count, rows;
    try {
      // Log the full query parameters
      // Log the raw SQL query
      const queryOptions = {
        where,
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: ChargingStation,
            as: 'charging_station',
            attributes: ['name', 'model', 'vendor', 'chargePointId'],
            required: false
          }
        ],
        logging: (sql) => {
          logger.debug('Executing SQL query:', sql);
        },
        raw: true,
        nest: true
      };
      
      const result = await Transaction.findAndCountAll(queryOptions);
      
      count = result.count;
      rows = result.rows.map(row => ({
        ...row,
        charging_station: row.charging_station || {}
      }));
      
      logger.debug(`Found ${rows.length} transactions matching query`);
      
    } catch (dbError) {
      logger.error('Database error in transactions query:', {
        error: dbError.message,
        stack: dbError.stack,
        query: dbError.sql
      });
      
      return res.status(500).json({
        success: false,
        message: 'Database error while retrieving transactions',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
    
    // Format the response to match frontend expectations
    const formattedTransactions = rows.map(tx => ({
      ...tx,
      charging_station: tx.charging_station || {
        name: 'Unknown Station',
        model: 'N/A',
        vendor: 'N/A',
        chargePointId: tx.chargePointId || 'N/A'
      }
    }));
    
    res.json({
      success: true,
      count,
      transactions: formattedTransactions
    });
  } catch (error) {
    logger.error('Unexpected error in transactions endpoint:', {
      error: error.message,
      stack: error.stack,
      query: error.sql,
      params: req.query
    });
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while processing your request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/transactions/complete/:id
 * @desc    Mark a transaction as complete (for fixing stuck transactions)
 * @access  Private
 */
router.post('/complete/:id', authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    
    // Try to find by transactionId first (which may be a numeric ID)
    let transaction = await Transaction.findOne({
      where: { transactionId: parseInt(transactionId) || transactionId }
    });
    
    // If not found, try looking up by the database ID
    if (!transaction) {
      transaction = await Transaction.findByPk(transactionId);
    }
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    // Only update if transaction is in progress or has no status
    if (transaction.status !== 'InProgress' && transaction.status !== null) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete transaction with status: ${transaction.status}`
      });
    }
    
    // Set end time if not already set
    const endTime = transaction.stopTime || new Date();
    
    // Update the transaction
    await transaction.update({
      status: 'Completed',
      stopTime: endTime,
      stopReason: req.body.reason || 'Manually completed due to error',
      updatedAt: new Date()
    });
    
    logger.info(`Transaction ${transactionId} manually marked as complete`);
    
    res.json({
      success: true,
      message: 'Transaction marked as complete',
      transaction
    });
  } catch (error) {
    logger.error(`Error marking transaction ${req.params.id} as complete:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark transaction as complete'
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
        stopTime: { [Op.gte]: startDate }
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
          startTime: { [Op.gte]: startDate }
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
            startTime: { [Op.gte]: startDate }
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

/**
 * @route   GET /api/transactions/stats/today
 * @desc    Get today's energy from database
 * @access  Private
 */
router.get('/stats/today', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await Transaction.findAll({
      where: {
        startTime: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
        status: 'Completed'
      },
      attributes: ['energyDelivered', 'stopMeterValue', 'startMeterValue'],
      raw: true
    });

    let totalEnergyWh = 0;
    transactions.forEach(t => {
      const energyFromDelivered = parseFloat(t.energyDelivered) || 0;
      const energyFromMeter = (parseFloat(t.stopMeterValue) || 0) - (parseFloat(t.startMeterValue) || 0);
      totalEnergyWh += Math.max(energyFromDelivered, energyFromMeter, 0);
    });

    const totalEnergyKwh = totalEnergyWh / 1000; // Convert Wh to kWh

    res.json({
      success: true,
      energyToday: totalEnergyKwh
    });
  } catch (error) {
    logger.error('Error fetching today\'s energy statistics:', error);
    res.json({
      success: true,
      energyToday: 0
    });
  }
});

/**
 * @route   POST /api/transactions/complete
 * @desc    Mark a transaction as complete (for fixing stuck transactions)
 * @access  Private
 */
router.post('/complete', authenticate, async (req, res) => {
  try {
    const { transactionId, reason } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    // Try to find by transactionId first (which may be a numeric ID)
    let transaction = await Transaction.findOne({
      where: { 
        transactionId: parseInt(transactionId) || transactionId 
      }
    });
    
    // If not found, try looking up by the database ID
    if (!transaction) {
      transaction = await Transaction.findByPk(transactionId);
    }
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    // Only update if transaction is in progress or has no status
    if (transaction.status !== 'InProgress' && transaction.status !== null) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete transaction with status: ${transaction.status}`
      });
    }
    
    // Set end time if not already set
    const endTime = transaction.stopTime || new Date();
    
    // Update the transaction
    await transaction.update({
      status: 'Completed',
      stopTime: endTime,
      stopReason: reason || 'Manually completed due to error',
      updatedAt: new Date()
    });
    
    logger.info(`Transaction ${transactionId} manually marked as complete`);
    
    res.json({
      success: true,
      message: 'Transaction marked as complete',
      transaction
    });
  } catch (error) {
    logger.error(`Error marking transaction as complete:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark transaction as complete'
    });
  }
});

/**
 * @route   POST /api/transactions/:id/reconcile
 * @desc    Reconcile a transaction using location-based pricing (fixes Wh to kWh errors)
 * @access  Private
 */
router.post('/:id/reconcile', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const transactionId = req.params.id;
    
    // Find transaction
    let transaction = await Transaction.findOne({
      where: { transactionId: parseInt(transactionId) || transactionId },
      transaction: t
    });
    
    if (!transaction) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'Completed') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Can only reconcile completed transactions'
      });
    }
    
    // Get station to find location
    const station = await ChargingStation.findOne({
      where: { chargePointId: transaction.chargePointId },
      transaction: t
    });
    
    if (!station || !station.locationId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Station or location not found'
      });
    }
    
    // Get location pricing
    const location = await Location.findByPk(station.locationId, { transaction: t });
    
    if (!location) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Location not found'
      });
    }
    
    const pricePerKwh = location.pricePerWh * 1000; // Convert from per Wh to per kWh
    const minimumCharge = location.minimumCharge || 0;
    const currentEnergy = parseFloat(transaction.energyDelivered) || 0; // in Wh
    const currentAmount = parseFloat(transaction.amount) || 0;
    
    // Calculate correct amount (energyDelivered is in Wh, convert to kWh)
    const energyInKwh = currentEnergy / 1000;
    const baseAmount = energyInKwh * pricePerKwh;
    const correctAmount = Math.max(baseAmount, minimumCharge);
    
    logger.info(`Reconciling transaction ${transactionId}:`, {
      currentEnergy,
      currentAmount,
      pricePerKwh,
      minimumCharge,
      baseAmount,
      correctAmount
    });
    
    if (Math.abs(currentAmount - correctAmount) < 0.01) {
      await t.rollback();
      return res.json({
        success: true,
        message: 'Transaction amount is already correct',
        transaction
      });
    }
    
    const adjustment = currentAmount - correctAmount; // Positive means overcharge, negative means undercharge
    
    // Update transaction amount
    await transaction.update({ amount: correctAmount }, { transaction: t });
    
    // Find user and update wallet if adjustment is significant
    if (Math.abs(adjustment) > 0.01 && transaction.idTag) {
      const user = await MobileUser.findOne({
        where: { tagId: transaction.idTag },
        transaction: t
      });
      
      if (user) {
        const wallet = await Wallet.findOne({
          where: { userId: user.id },
          transaction: t
        });
        
        if (wallet) {
          const newBalance = parseFloat(wallet.balance) + adjustment;
          await wallet.update({ balance: newBalance }, { transaction: t });
          
          // Create payment transaction record
          await PaymentTransaction.create({
            userId: user.id,
            walletId: wallet.id,
            amount: Math.abs(adjustment),
            type: adjustment > 0 ? 'CREDIT' : 'DEBIT',
            status: 'SUCCESS',
            reference: `RECONCILE-TX${transactionId}-${Date.now()}`,
            description: `Transaction reconciliation for TX${transactionId}`,
            metadata: JSON.stringify({
              transaction_id: transactionId,
              previous_amount: currentAmount,
              corrected_amount: correctAmount,
              adjustment,
              location_pricing: { pricePerKwh, minimumCharge }
            })
          }, { transaction: t });
          
          logger.info(`Wallet adjusted by ${adjustment} for user ${user.id}`);
        }
      }
    }
    
    await t.commit();
    
    res.json({
      success: true,
      message: `Transaction reconciled successfully. Amount updated from ₦${currentAmount.toFixed(2)} to ₦${correctAmount.toFixed(2)}`,
      transaction,
      adjustment
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error reconciling transaction ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to reconcile transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
