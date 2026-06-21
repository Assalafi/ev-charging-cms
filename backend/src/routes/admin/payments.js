const express = require('express');
const { Op } = require('sequelize');
const { Wallet, PaymentTransaction, MobileUser, PaymentSettings } = require('../../models');
const { authenticate, authorize } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * @route   GET /api/admin/payments/settings
 * @desc    Get payment settings
 */
router.get('/settings', authorize(['admin', 'operator']), async (req, res) => {
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
router.put('/settings', authorize(['admin']), async (req, res) => {
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
router.get('/transactions', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, userId, type, startDate, endDate, gateway } = req.query;
    
    const offset = (page - 1) * limit;
    const whereClause = {};
    
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = userId;
    if (type) whereClause.type = type;
    if (gateway) whereClause.gateway = gateway;
    
    // Date range filtering with time
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = end;
      }
    }
    
    const transactions = await PaymentTransaction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Wallet,
          as: 'wallet'
        },
        {
          model: MobileUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      transactions: transactions.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: transactions.count,
        pages: Math.ceil(transactions.count / limit)
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
router.get('/wallets', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const wallets = await Wallet.findAndCountAll({
      include: [
        {
          model: MobileUser,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        }
      ],
      order: [[{ model: MobileUser, as: 'user' }, 'name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const totalBalance = wallets.rows.reduce((sum, wallet) => sum + parseFloat(wallet.balance || 0), 0);

    res.json({
      success: true,
      wallets: wallets.rows,
      summary: {
        totalBalance,
        totalWallets: wallets.count,
        averageBalance: wallets.count > 0 ? totalBalance / wallets.count : 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: wallets.count,
        pages: Math.ceil(wallets.count / limit)
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
router.post('/verify/:transactionId', authorize(['admin']), async (req, res) => {
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
router.post('/wallets/:walletId/fund', authorize(['admin']), async (req, res) => {
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
router.get('/users', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const users = await MobileUser.findAll({
      attributes: ['id', 'name', 'phone', 'email'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      users
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
router.get('/stats', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const { period = '30' } = req.query; // Default to last 30 days
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));
    
    // Transaction stats
    const totalTransactions = await PaymentTransaction.count({
      where: { createdAt: { [Op.gte]: daysAgo } }
    });
    
    const successfulTransactions = await PaymentTransaction.count({
      where: { 
        status: 'SUCCESS',
        createdAt: { [Op.gte]: daysAgo }
      }
    });
    
    const failedTransactions = await PaymentTransaction.count({
      where: { 
        status: 'FAILED',
        createdAt: { [Op.gte]: daysAgo }
      }
    });
    
    const totalVolume = await PaymentTransaction.sum('amount', {
      where: { 
        status: 'SUCCESS',
        createdAt: { [Op.gte]: daysAgo }
      }
    }) || 0;
    
    // Wallet stats
    const totalWallets = await Wallet.count();
    const totalWalletBalance = await Wallet.sum('balance') || 0;
    const activeWallets = await Wallet.count({
      where: { 
        balance: { [Op.gt]: 0 },
        isActive: true
      }
    });

    res.json({
      success: true,
      stats: {
        transactions: {
          total: totalTransactions,
          successful: successfulTransactions,
          failed: failedTransactions,
          pending: totalTransactions - successfulTransactions - failedTransactions,
          successRate: totalTransactions > 0 ? (successfulTransactions / totalTransactions * 100).toFixed(2) : 0,
          totalVolume: parseFloat(totalVolume)
        },
        wallets: {
          total: totalWallets,
          active: activeWallets,
          totalBalance: parseFloat(totalWalletBalance),
          averageBalance: totalWallets > 0 ? (totalWalletBalance / totalWallets).toFixed(2) : 0
        },
        period: `${period} days`
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
