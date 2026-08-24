const express = require('express');
const { Wallet, PaymentTransaction, MobileUser, PaymentSettings } = require('../../models');
const logger = require('../../utils/logger');

const router = express.Router();

// Mobile authentication middleware (same as mobile.js)
function mobileAuth(req, res, next) {
  logger.info('Mobile wallet auth middleware called', { 
    path: req.path, 
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    authHeaderPrefix: req.headers.authorization?.split(' ')[0]
  });
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Mobile wallet auth failed: No valid Bearer token', { path: req.path });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const getJwtSecret = () => process.env.JWT_SECRET || 'ev-charging-secure-secret';
  
  try {
    logger.debug('Mobile wallet auth: Verifying token', { path: req.path, tokenLength: token.length });
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded.id || !decoded.isMobile) {
      logger.warn('Mobile wallet auth failed: Invalid mobile token structure', { path: req.path, decoded });
      throw new Error('Invalid mobile token');
    }
    logger.info('Mobile wallet auth success', { path: req.path, userId: decoded.id, userEmail: decoded.email });
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Mobile wallet auth error', { path: req.path, error: error.message, errorName: error.name });
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid authentication token' });
  }
}

/**
 * @route   GET /api/mobile/wallet/paystack-config
 * @desc    Get Paystack configuration (public key)
 */
router.get('/paystack-config', mobileAuth, async (req, res) => {
  logger.info('=== PAYSTACK CONFIG REQUEST START ===');
  try {
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    
    if (!paystackSettings || !paystackSettings.publicKey) {
      logger.error('Paystack public key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Payment service not configured' 
      });
    }
    
    logger.info('Paystack public key retrieved');
    res.json({
      success: true,
      publicKey: paystackSettings.publicKey
    });
  } catch (error) {
    logger.error('Get Paystack config error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get payment configuration' 
    });
  }
});

/**
 * @route   GET /api/mobile/wallet/balance
 * @desc    Get user's wallet balance
 */
router.get('/balance', mobileAuth, async (req, res) => {
  logger.info('=== WALLET BALANCE REQUEST START ===');
  logger.info('Request user:', JSON.stringify(req.user, null, 2));
  
  try {
    const userId = req.user.id;
    logger.info('Extracted userId:', userId);
    
    // Find or create wallet for user
    logger.info('Finding wallet for userId:', userId);
    let wallet = await Wallet.findOne({ where: { userId } });
    
    if (!wallet) {
      logger.info('Wallet not found, creating new wallet');
      wallet = await Wallet.create({ 
        userId, 
        balance: 0.00, 
        currency: 'NGN' 
      });
      logger.info('New wallet created:', JSON.stringify(wallet, null, 2));
    } else {
      logger.info('Existing wallet found:', JSON.stringify(wallet, null, 2));
    }

    logger.info('Sending balance response:', parseFloat(wallet.balance));
    res.json({
      success: true,
      balance: parseFloat(wallet.balance),
      currency: wallet.currency
    });
    logger.info('=== WALLET BALANCE REQUEST SUCCESS ===');
  } catch (error) {
    logger.error('=== WALLET BALANCE CATCH ERROR ===');
    logger.error('Error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch wallet balance' 
    });
  }
});

/**
 * @route   GET /api/mobile/wallet/transactions
 * @desc    Get user's payment transaction history
 */
router.get('/transactions', mobileAuth, async (req, res) => {
  logger.info('=== WALLET TRANSACTIONS REQUEST START ===');
  logger.info('Request user:', JSON.stringify(req.user, null, 2));
  logger.info('Request query:', JSON.stringify(req.query, null, 2));
  
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    logger.info('Extracted userId:', userId);
    logger.info('Page:', page);
    logger.info('Limit:', limit);
    
    const offset = (page - 1) * limit;
    logger.info('Offset:', offset);
    
    logger.info('Fetching transactions for userId:', userId);
    const transactions = await PaymentTransaction.findAndCountAll({
      where: { userId },
      include: [{
        model: Wallet,
        as: 'wallet',
        attributes: ['id', 'currency']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    logger.info('Found transactions count:', transactions.count);
    logger.info('Transactions rows:', transactions.rows.length);
    
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
    logger.info('=== WALLET TRANSACTIONS REQUEST SUCCESS ===');
  } catch (error) {
    logger.error('=== WALLET TRANSACTIONS CATCH ERROR ===');
    logger.error('Error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transactions' 
    });
  }
});

/**
 * @route   POST /api/mobile/wallet/fund
 * @desc    Initialize wallet funding with Paystack Card Payment
 */
router.post('/fund', mobileAuth, async (req, res) => {
  logger.info('=== WALLET FUND REQUEST START ===');
  logger.info('Request body:', JSON.stringify(req.body, null, 2));
  logger.info('Request user:', JSON.stringify(req.user, null, 2));
  
  try {
    const userId = req.user.id;
    const { amount } = req.body;
    
    logger.info('Extracted userId:', userId);
    logger.info('Extracted amount:', amount);
    
    if (!amount || amount <= 0) {
      logger.error('Invalid amount:', amount);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }

    logger.info('Finding or creating wallet for userId:', userId);
    // Find or create wallet
    let wallet = await Wallet.findOne({ where: { userId } });
    
    if (!wallet) {
      logger.info('Wallet not found, creating new wallet');
      wallet = await Wallet.create({ 
        userId, 
        balance: 0.00, 
        currency: 'NGN' 
      });
      logger.info('New wallet created:', JSON.stringify(wallet, null, 2));
    } else {
      logger.info('Existing wallet found:', JSON.stringify(wallet, null, 2));
    }

    // Get user email
    logger.info('Getting user email');
    const user = await MobileUser.findByPk(userId);
    
    // Check if user account is suspended
    if (user && user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact support.' });
    }

    if (user && user.status === 'deleted') {
      return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
    }
    
    const userEmail = user?.email;
    
    logger.info('User email:', userEmail);
    
    if (!userEmail) {
      logger.error('Email is required for payment');
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required for payment' 
      });
    }

    // Generate unique reference
    const reference = `WALLET_FUND_${userId}_${Date.now()}`;
    logger.info('Generated reference:', reference);
    
    logger.info('Creating pending transaction');
    // Create pending transaction
    const transaction = await PaymentTransaction.create({
      userId,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: parseFloat(amount),
      currency: 'NGN',
      reference,
      gateway: 'paystack',
      status: 'PENDING',
      description: 'Wallet funding via card payment',
      metadata: { email: userEmail }
    });
    logger.info('Transaction created:', JSON.stringify(transaction, null, 2));

    // Initialize Paystack transaction
    const https = require('https');
    
    // Get Paystack secret key from PaymentSettings
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    const paystackSecret = paystackSettings.secretKey;
    
    logger.info('Paystack secret:', paystackSecret ? 'Present' : 'Missing');
    
    if (!paystackSecret) {
      logger.error('PAYSTACK_SECRET_KEY not configured in PaymentSettings');
      return res.status(500).json({ 
        success: false, 
        message: 'Payment service not configured' 
      });
    }

    logger.info('Preparing Paystack request');
    const params = JSON.stringify({
      amount: Math.round(amount * 100), // Convert to kobo
      email: userEmail,
      reference,
      currency: 'NGN',
      channels: ['bank_transfer'], // Pay with Transfer (generates temporary account)
      callback_url: 'https://evcharge.evworld.ng/#/wallet/verify',
      metadata: {
        userId,
        transactionId: transaction.id,
        custom_fields: [
          {
            display_name: 'Wallet Funding',
            variable_name: 'wallet_funding',
            value: 'true'
          }
        ]
      }
    });
    logger.info('Paystack request params:', JSON.stringify(JSON.parse(params), null, 2));

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
        'Content-Length': params.length
      }
    };
    logger.info('Paystack request options:', JSON.stringify(options, null, 2));

    logger.info('Sending Paystack request');
    const paystackReq = https.request(options, (paystackRes) => {
      logger.info('Paystack response status:', paystackRes.statusCode);
      logger.info('Paystack response headers:', JSON.stringify(paystackRes.headers, null, 2));
      
      let data = '';
      
      paystackRes.on('data', (chunk) => {
        data += chunk;
      });
      
      paystackRes.on('end', async () => {
        logger.info('Paystack response body:', data);
        try {
          const response = JSON.parse(data);
          logger.info('Parsed Paystack response:', JSON.stringify(response, null, 2));
          
          if (response.status) {
            logger.info('Paystack initialization successful');
            // Update transaction with Paystack data
            await transaction.update({
              gatewayResponse: JSON.stringify(response)
            });
            logger.info('Transaction updated with Paystack response');

            logger.info('Sending success response to client');
            res.json({
              success: true,
              authorization_url: response.data.authorization_url,
              access_code: response.data.access_code,
              reference: response.data.reference
            });
            logger.info('=== WALLET FUND REQUEST SUCCESS ===');
          } else {
            logger.error('Paystack initialization failed:', response.message);
            await transaction.update({ status: 'FAILED' });
            res.status(400).json({ 
              success: false, 
              message: response.message || 'Payment initialization failed' 
            });
            logger.info('=== WALLET FUND REQUEST FAILED ===');
          }
        } catch (parseError) {
          logger.error('Paystack response parse error:', parseError);
          logger.error('Raw response:', data);
          res.status(500).json({ 
            success: false, 
            message: 'Payment processing error' 
          });
          logger.info('=== WALLET FUND REQUEST ERROR ===');
        }
      });
    });

    paystackReq.on('error', (error) => {
      logger.error('Paystack request error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Payment service error' 
      });
      logger.info('=== WALLET FUND REQUEST ERROR ===');
    });

    paystackReq.write(params);
    paystackReq.end();

  } catch (error) {
    logger.error('=== WALLET FUND CATCH ERROR ===');
    logger.error('Error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to initialize funding' 
    });
  }
});

/**
 * @route   GET /api/mobile/wallet/verify
 * @desc    Verify Paystack card payment and credit wallet
 */
router.get('/verify', mobileAuth, async (req, res) => {
  logger.info('=== WALLET VERIFY REQUEST START ===');
  logger.info('Request query:', JSON.stringify(req.query, null, 2));
  logger.info('Request user:', JSON.stringify(req.user, null, 2));
  
  try {
    const { reference, trxref } = req.query;
    const ref = reference || trxref;
    
    logger.info('Extracted reference:', ref);
    
    if (!ref) {
      logger.error('Transaction reference is required');
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction reference is required' 
      });
    }

    logger.info('Finding transaction with reference:', ref);
    // Find transaction
    const transaction = await PaymentTransaction.findOne({
      where: { reference: ref },
      include: [{ model: Wallet, as: 'wallet' }]
    });

    if (!transaction) {
      logger.error('Transaction not found for reference:', ref);
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    logger.info('Transaction found:', JSON.stringify(transaction, null, 2));
    logger.info('Transaction status:', transaction.status);

    if (transaction.status === 'SUCCESS') {
      logger.info('Transaction already processed');
      return res.json({
        success: true,
        message: 'Transaction already processed',
        balance: parseFloat(transaction.wallet.balance)
      });
    }

    logger.info('Verifying with Paystack');
    // Verify with Paystack
    const https = require('https');
    
    // Get Paystack secret key from PaymentSettings
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    const paystackSecret = paystackSettings.secretKey;
    
    logger.info('Paystack secret:', paystackSecret ? 'Present' : 'Missing');
    
    if (!paystackSecret) {
      logger.error('PAYSTACK_SECRET_KEY not configured in PaymentSettings');
      return res.status(500).json({ 
        success: false, 
        message: 'Payment service not configured' 
      });
    }
    
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${ref}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecret}`
      }
    };
    logger.info('Paystack verify options:', JSON.stringify(options, null, 2));

    logger.info('Sending Paystack verify request');
    const paystackReq = https.request(options, async (paystackRes) => {
      logger.info('Paystack verify response status:', paystackRes.statusCode);
      logger.info('Paystack verify response headers:', JSON.stringify(paystackRes.headers, null, 2));
      
      let data = '';
      
      paystackRes.on('data', (chunk) => {
        data += chunk;
      });
      
      paystackRes.on('end', async () => {
        logger.info('Paystack verify response body:', data);
        try {
          const response = JSON.parse(data);
          logger.info('Parsed Paystack verify response:', JSON.stringify(response, null, 2));
          
          if (response.status && response.data.status === 'success') {
            logger.info('Payment verification successful');
            // Credit wallet
            const wallet = transaction.wallet;
            const currentBalance = parseFloat(wallet.balance);
            const amount = parseFloat(transaction.amount);
            const newBalance = currentBalance + amount;
            
            logger.info('Current wallet balance:', currentBalance);
            logger.info('Transaction amount:', amount);
            logger.info('New wallet balance:', newBalance);
            
            await wallet.update({ balance: newBalance });
            logger.info('Wallet balance updated');
            
            await transaction.update({ 
              status: 'SUCCESS',
              gatewayResponse: JSON.stringify(response)
            });
            logger.info('Transaction updated to SUCCESS');

            logger.info(`Wallet funded: ${wallet.userId} - ₦${amount}`);

            logger.info('Sending success response to client');
            res.json({
              success: true,
              message: 'Payment successful, wallet credited',
              balance: newBalance,
              amount: amount
            });
            logger.info('=== WALLET VERIFY REQUEST SUCCESS ===');
          } else {
            logger.error('Payment verification failed:', response.data?.status || 'Unknown');
            logger.error('Paystack response:', JSON.stringify(response, null, 2));
            await transaction.update({ 
              status: 'FAILED',
              gatewayResponse: JSON.stringify(response)
            });
            logger.info('Transaction updated to FAILED');

            res.status(400).json({ 
              success: false, 
              message: response.message || 'Payment verification failed' 
            });
            logger.info('=== WALLET VERIFY REQUEST FAILED ===');
          }
        } catch (parseError) {
          logger.error('Paystack verification parse error:', parseError);
          logger.error('Raw response:', data);
          res.status(500).json({ 
            success: false, 
            message: 'Payment verification error' 
          });
          logger.info('=== WALLET VERIFY REQUEST ERROR ===');
        }
      });
    });

    paystackReq.on('error', (error) => {
      logger.error('Paystack verification error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Payment verification service error' 
      });
      logger.info('=== WALLET VERIFY REQUEST ERROR ===');
    });

    paystackReq.end();

  } catch (error) {
    logger.error('=== WALLET VERIFY CATCH ERROR ===');
    logger.error('Error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify payment' 
    });
  }
});

module.exports = router;
