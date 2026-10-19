const express = require('express');
const { Op } = require('sequelize');
const { Wallet, PaymentTransaction, MobileUser, PaymentSettings } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const logger = require('../../utils/logger');
const { parseLagosDate } = require('../../utils/timezone');

const router = express.Router();

// Date-only filters represent a West Africa calendar date. Complete ISO
// timestamps already identify an instant and must be preserved as-is.
const parseDateFilter = (value, endOfDay = false) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return parseLagosDate(value, endOfDay);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date filter');
  return parsed;
};

const normaliseSearch = value => String(value || '').trim();

const userSearchWhere = search => {
  const term = normaliseSearch(search);
  if (!term) return undefined;
  return {
    [Op.or]: [
      { name: { [Op.iLike]: `%${term}%` } },
      { email: { [Op.iLike]: `%${term}%` } },
      { phone: { [Op.iLike]: `%${term}%` } },
      { tagId: { [Op.iLike]: `%${term}%` } }
    ]
  };
};

const userInclude = (search, attributes = ['id', 'name', 'email', 'phone', 'tagId'], requireMatch = Boolean(normaliseSearch(search))) => ({
  model: MobileUser,
  as: 'user',
  attributes,
  required: requireMatch,
  ...(requireMatch && normaliseSearch(search) ? { where: userSearchWhere(search) } : {})
});

const paymentWhere = ({ status, userId, type, startDate, endDate, gateway, search } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;
  if (type) where.type = type;
  if (gateway) where.gateway = gateway;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = parseDateFilter(startDate);
    if (endDate) where.createdAt[Op.lte] = parseDateFilter(endDate, true);
  }
  const term = normaliseSearch(search);
  if (term) {
    const pattern = `%${term}%`;
    where[Op.or] = [
      { reference: { [Op.iLike]: pattern } },
      { description: { [Op.iLike]: pattern } },
      { '$user.name$': { [Op.iLike]: pattern } },
      { '$user.email$': { [Op.iLike]: pattern } },
      { '$user.phone$': { [Op.iLike]: pattern } },
      { '$user.tagId$': { [Op.iLike]: pattern } }
    ];
  }
  return { where, search: term };
};

const summarisePaymentRows = rows => {
  const summary = {
    total: rows.length,
    successful: 0,
    pending: 0,
    failed: 0,
    reversed: 0,
    totalVolume: 0,
    successfulVolume: 0,
    pendingVolume: 0,
    failedVolume: 0,
    reversedVolume: 0,
    creditVolume: 0,
    debitVolume: 0
  };
  rows.forEach(row => {
    const amount = Number(row.amount) || 0;
    const status = String(row.status || '').toUpperCase();
    const type = String(row.type || '').toUpperCase();
    summary.totalVolume += amount;
    if (type === 'CREDIT') summary.creditVolume += amount;
    if (type === 'DEBIT') summary.debitVolume += amount;
    if (status === 'SUCCESS') {
      summary.successful += 1;
      summary.successfulVolume += amount;
    } else if (status === 'PENDING') {
      summary.pending += 1;
      summary.pendingVolume += amount;
    } else if (status === 'FAILED') {
      summary.failed += 1;
      summary.failedVolume += amount;
    } else if (status === 'REVERSED') {
      summary.reversed += 1;
      summary.reversedVolume += amount;
    }
  });
  summary.successRate = summary.total > 0
    ? Number(((summary.successful / summary.total) * 100).toFixed(2))
    : 0;
  return summary;
};

const loadPaymentSummary = async ({ where, search }) => {
  const rows = await PaymentTransaction.findAll({
    where,
    include: [userInclude(search, [], false)],
    attributes: ['amount', 'status', 'type'],
    raw: true
  });
  return summarisePaymentRows(rows);
};

// Apply authentication middleware
router.use(authenticate);

/**
 * @route   GET /api/admin/payments/settings
 * @desc    Get payment settings
 */
router.get('/settings', requirePermission('payments.view'), async (req, res) => {
  try {
    // Initialize default settings if table is empty
    await PaymentSettings.initializeDefaults();

    // Get settings from database
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    const walletSettings = await PaymentSettings.getCategorySettings('wallet');
    const featureSettings = await PaymentSettings.getCategorySettings('features');

    // Mask secret key for security
    if (paystackSettings.secretKey && paystackSettings.secretKey !== '') {
      paystackSettings.secretKey = '******';
    }

    const settings = {
      paystack: paystackSettings,
      wallet: walletSettings,
      features: featureSettings
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Get payment settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment settings' 
    });
  }
});

/**
 * @route   PUT /api/admin/payments/settings
 * @desc    Update payment settings
 */
router.put('/settings', requirePermission('payments.manage'), async (req, res) => {
  try {
    const { paystack, wallet, features } = req.body;
    
    // Update settings in database
    if (paystack) {
      await PaymentSettings.updateCategorySettings('paystack', paystack, req.user.id);
    }
    
    if (wallet) {
      await PaymentSettings.updateCategorySettings('wallet', wallet, req.user.id);
    }
    
    if (features) {
      await PaymentSettings.updateCategorySettings('features', features, req.user.id);
    }

    logger.info('Payment settings updated by admin', { 
      userId: req.user.id,
      updatedCategories: Object.keys(req.body).filter(key => req.body[key])
    });

    res.json({
      success: true,
      message: 'Payment settings updated successfully'
    });
  } catch (error) {
    logger.error('Update payment settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payment settings' 
    });
  }
});

/**
 * @route   GET /api/admin/payments/transactions
 * @desc    Get all payment transactions
 */
router.get('/transactions', requirePermission('payments.view'), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, userId, type, startDate, endDate, gateway, search } = req.query;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const { where: whereClause, search: normalisedSearch } = paymentWhere({
      status, userId, type, startDate, endDate, gateway, search
    });
    const offset = (safePage - 1) * safeLimit;
    
    const transactions = await PaymentTransaction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Wallet,
          as: 'wallet'
        },
        {
          ...userInclude(normalisedSearch, ['id', 'name', 'email', 'phone', 'tagId'], false)
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset,
      distinct: true
    });

    const summary = await loadPaymentSummary({ where: whereClause, search: normalisedSearch });

    res.json({
      success: true,
      transactions: transactions.rows,
      summary,
      filters: { status: status || '', userId: userId || '', type: type || '', startDate: startDate || '', endDate: endDate || '', gateway: gateway || '', search: normalisedSearch },
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: transactions.count,
        pages: Math.max(1, Math.ceil(transactions.count / safeLimit))
      }
    });
  } catch (error) {
    logger.error('Get payment transactions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transactions' 
    });
  }
});

/**
 * @route   GET /api/admin/payments/wallets
 * @desc    Get all user wallets
 */
router.get('/wallets', requirePermission('payments.view'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, balanceBand, userId } = req.query;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;
    const where = {};
    if (userId) where.userId = userId;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (balanceBand === 'positive') where.balance = { [Op.gt]: 0 };
    if (balanceBand === 'negative') where.balance = { [Op.lt]: 0 };
    if (balanceBand === 'zero') where.balance = 0;
    const normalisedSearch = normaliseSearch(search);
    
    const wallets = await Wallet.findAndCountAll({
      where,
      include: [
        userInclude(normalisedSearch)
      ],
      order: [[{ model: MobileUser, as: 'user' }, 'name', 'ASC']],
      limit: safeLimit,
      offset,
      distinct: true
    });

    const summaryRows = await Wallet.findAll({
      where,
      include: [userInclude(normalisedSearch, [])],
      attributes: ['balance', 'isActive'],
      raw: true
    });
    const summary = summaryRows.reduce((result, wallet) => {
      const balance = Number(wallet.balance) || 0;
      result.totalBalance += balance;
      if (balance > 0) result.positiveBalance += balance;
      if (balance < 0) result.debtBalance += Math.abs(balance);
      if (balance === 0) result.zeroBalance += 1;
      if (wallet.isActive) result.active += 1;
      return result;
    }, {
      totalWallets: summaryRows.length,
      active: 0,
      totalBalance: 0,
      positiveBalance: 0,
      debtBalance: 0,
      zeroBalance: 0,
      averageBalance: 0
    });
    summary.averageBalance = summary.totalWallets > 0
      ? summary.totalBalance / summary.totalWallets
      : 0;

    res.json({
      success: true,
      wallets: wallets.rows,
      summary,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: wallets.count,
        pages: Math.max(1, Math.ceil(wallets.count / safeLimit))
      }
    });
  } catch (error) {
    logger.error('Get wallets error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch wallets' 
    });
  }
});

/**
 * @route   POST /api/admin/payments/verify/:transactionId
 * @desc    Verify a payment transaction against Paystack API
 */
router.post('/verify/:transactionId', requirePermission('payments.manage'), async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await PaymentTransaction.findByPk(transactionId, {
      include: [
        { model: Wallet, as: 'wallet' },
        { model: MobileUser, as: 'user' }
      ]
    });

    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    if (transaction.status === 'SUCCESS') {
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction already verified' 
      });
    }

    if (!transaction.reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'No payment reference found for this transaction' 
      });
    }

    // Get Paystack secret key from settings
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    const secretKey = paystackSettings.secretKey;
    
    if (!secretKey) {
      return res.status(500).json({ 
        success: false, 
        message: 'Paystack secret key not configured' 
      });
    }

    // Verify transaction with Paystack API
    const https = require('https');
    const paystackResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: `/transaction/verify/${transaction.reference}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`
        }
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse Paystack response'));
          }
        });
      });

      request.on('error', (error) => reject(error));
      request.end();
    });

    logger.info(`Paystack verify response for ${transaction.reference}:`, { 
      status: paystackResponse.status, 
      data_status: paystackResponse.data?.status 
    });

    if (paystackResponse.status && paystackResponse.data?.status === 'success') {
      // Payment confirmed by Paystack - credit wallet
      const wallet = transaction.wallet;
      const newBalance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
      
      await wallet.update({ balance: newBalance });
      await transaction.update({ 
        status: 'SUCCESS',
        gatewayResponse: JSON.stringify({ 
          paystackVerified: true, 
          verifiedBy: req.user.id,
          paystackData: paystackResponse.data,
          verifiedAt: new Date().toISOString()
        })
      });

      logger.info(`Payment verified via Paystack: ${transaction.id} by admin ${req.user.id}`);

      res.json({
        success: true,
        message: 'Payment verified via Paystack and wallet credited',
        paystackStatus: paystackResponse.data.status,
        newBalance,
        amount: parseFloat(transaction.amount)
      });
    } else if (paystackResponse.data?.status === 'abandoned' || paystackResponse.data?.status === 'failed') {
      // Payment failed on Paystack
      await transaction.update({ 
        status: 'FAILED',
        gatewayResponse: JSON.stringify({ 
          paystackVerified: true, 
          verifiedBy: req.user.id,
          paystackData: paystackResponse.data,
          verifiedAt: new Date().toISOString()
        })
      });

      res.json({
        success: true,
        message: `Payment ${paystackResponse.data.status} on Paystack. Transaction marked as failed.`,
        paystackStatus: paystackResponse.data.status
      });
    } else {
      // Still pending or unknown status
      res.json({
        success: false,
        message: `Payment still ${paystackResponse.data?.status || 'unknown'} on Paystack`,
        paystackStatus: paystackResponse.data?.status || 'unknown'
      });
    }
  } catch (error) {
    logger.error('Payment verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify payment: ' + error.message 
    });
  }
});

/**
 * @route   POST /api/admin/payments/wallets/:walletId/fund
 * @desc    Admin fund a user's wallet (manual top-up)
 */
router.post('/wallets/:walletId/fund', requirePermission('payments.manage'), async (req, res) => {
  try {
    const { walletId } = req.params;
    const { amount, description } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const wallet = await Wallet.findByPk(walletId, {
      include: [{ model: MobileUser, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }]
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const fundAmount = parseFloat(amount);
    const previousBalance = parseFloat(wallet.balance);
    const newBalance = previousBalance + fundAmount;

    // Create payment transaction record
    const transaction = await PaymentTransaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: fundAmount,
      currency: wallet.currency || 'NGN',
      reference: `ADMIN-FUND-${Date.now()}-${wallet.id}`,
      gateway: 'admin',
      status: 'SUCCESS',
      description: description || `Admin wallet top-up by ${req.user.username}`,
      metadata: {
        fundedBy: req.user.id,
        fundedByUsername: req.user.username,
        previousBalance,
        newBalance,
        fundedAt: new Date().toISOString()
      }
    });

    // Update wallet balance
    await wallet.update({ balance: newBalance });

    logger.info(`Admin ${req.user.username} funded wallet ${walletId} (user: ${wallet.user?.name}) with ${fundAmount}. Balance: ${previousBalance} -> ${newBalance}`);

    res.json({
      success: true,
      message: `Successfully added ${fundAmount} to ${wallet.user?.name || 'user'}'s wallet`,
      transaction: {
        id: transaction.id,
        amount: fundAmount,
        previousBalance,
        newBalance
      }
    });
  } catch (error) {
    logger.error('Admin fund wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fund wallet: ' + error.message
    });
  }
});

/**
 * @route   GET /api/admin/payments/users
 * @desc    Get mobile users for filter dropdown
 */
router.get('/users', requirePermission('payments.view'), async (req, res) => {
  try {
    const { q = '', limit = 40 } = req.query;
    const search = normaliseSearch(q);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    const users = await MobileUser.findAll({
      attributes: ['id', 'name', 'phone', 'email', 'tagId'],
      ...(userSearchWhere(search) ? { where: userSearchWhere(search) } : {}),
      order: [['name', 'ASC']],
      limit: safeLimit
    });

    res.json({
      success: true,
      users,
      query: search,
      pagination: { limit: safeLimit, total: users.length, hasMore: users.length === safeLimit }
    });
  } catch (error) {
    logger.error('Get mobile users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * @route   GET /api/admin/payments/stats
 * @desc    Get payment statistics
 */
router.get('/stats', requirePermission('payments.view'), async (req, res) => {
  try {
    const { period = '30', startDate, endDate, status, userId, type, gateway, search } = req.query;
    const baseFilters = paymentWhere({ status, userId, type, startDate, endDate, gateway, search });
    const whereClause = baseFilters.where;
    if (!startDate && !endDate) {
      const days = Math.max(1, parseInt(period, 10) || 30);
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      whereClause.createdAt = { [Op.gte]: daysAgo };
    }

    const summary = await loadPaymentSummary({ where: whereClause, search: baseFilters.search });
    const walletRows = await Wallet.findAll({
      where: userId ? { userId } : {},
      include: [userInclude(baseFilters.search, [])],
      attributes: ['balance', 'isActive'],
      raw: true
    });
    const walletSummary = walletRows.reduce((result, wallet) => {
      const balance = Number(wallet.balance) || 0;
      result.totalBalance += balance;
      if (wallet.isActive && balance > 0) result.active += 1;
      return result;
    }, { total: walletRows.length, active: 0, totalBalance: 0 });
    walletSummary.averageBalance = walletSummary.total > 0
      ? walletSummary.totalBalance / walletSummary.total
      : 0;

    res.json({
      success: true,
      stats: {
        transactions: {
          ...summary,
          // Preserve the original meaning of totalVolume as successful volume.
          totalVolume: summary.successfulVolume,
          grossVolume: summary.totalVolume
        },
        wallets: {
          total: walletSummary.total,
          active: walletSummary.active,
          totalBalance: walletSummary.totalBalance,
          averageBalance: walletSummary.averageBalance
        },
        period: startDate || endDate ? 'Custom range' : `${Math.max(1, parseInt(period, 10) || 30)} days`,
        filters: { status: status || '', userId: userId || '', type: type || '', gateway: gateway || '', search: baseFilters.search, startDate: startDate || '', endDate: endDate || '' }
      }
    });
  } catch (error) {
    logger.error('Get payment stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment statistics' 
    });
  }
});

module.exports = router;
