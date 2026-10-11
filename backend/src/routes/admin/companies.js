const express = require('express');
const { Op } = require('sequelize');
const {
  SubscriptionCompany,
  CompanyWallet,
  CompanyWalletTransaction,
  CompanyFundingRule,
  CompanyUser,
  MobileUser,
  Wallet,
  AuthorizedTag,
  PaymentSettings,
  sequelize
} = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const logger = require('../../utils/logger');
const {
  fundCompanyWallet,
  initializeCompanyGatewayFunding,
  settleCompanyGatewayFunding,
  transferCompanyFundsToUser,
  nextRunAt
} = require('../../services/companyFundingService');

const router = express.Router();

const COMPANY_ATTRIBUTES = ['id', 'name', 'email', 'phone', 'address', 'city', 'state', 'country', 'status', 'notes', 'createdBy', 'createdAt', 'updatedAt'];
const COMPANY_USER_ATTRIBUTES = ['id', 'companyId', 'name', 'email', 'phone', 'role', 'status', 'lastLogin', 'createdAt', 'updatedAt'];

function parsePage(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function cleanCompanyPayload(body = {}) {
  return {
    name: String(body.name || '').trim(),
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    address: body.address ? String(body.address).trim() : null,
    city: body.city ? String(body.city).trim() : null,
    state: body.state ? String(body.state).trim() : null,
    country: body.country ? String(body.country).trim() : 'Nigeria',
    notes: body.notes ? String(body.notes).trim() : null
  };
}

function phoneToTagId(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `MOB${digits.slice(-10)}`;
}

function serializeCompany(company) {
  const value = company.toJSON ? company.toJSON() : company;
  return {
    ...value,
    walletBalance: Number(value.wallet?.balance || 0),
    userCount: value.mobileUsers?.length || value.userCount || 0,
    activeUserCount: value.activeUserCount || 0
  };
}

function serializeCompanyUser(user) {
  const data = user.toJSON ? user.toJSON() : user;
  const { password, ...safe } = data;
  return safe;
}

function paystackRequest({ method = 'GET', path, secretKey, payload }) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const request = https.request({
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, body: JSON.parse(data || '{}') });
        } catch (error) {
          reject(new Error('Invalid payment gateway response'));
        }
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('Payment gateway request timed out')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

router.get('/', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePage(req.query);
    const where = {};
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.state) where.state = req.query.state;
    if (req.query.search) {
      const search = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: search } },
        { email: { [Op.iLike]: search } },
        { phone: { [Op.iLike]: search } },
        { city: { [Op.iLike]: search } },
        { state: { [Op.iLike]: search } }
      ];
    }

    const { count, rows } = await SubscriptionCompany.findAndCountAll({
      where,
      attributes: COMPANY_ATTRIBUTES,
      include: [
        { model: CompanyWallet, as: 'wallet', attributes: ['id', 'balance', 'currency', 'isActive'], required: false },
        { model: MobileUser, as: 'mobileUsers', attributes: ['id', 'status'], required: false }
      ],
      distinct: true,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const [total, active, suspended, users] = await Promise.all([
      SubscriptionCompany.count(),
      SubscriptionCompany.count({ where: { status: 'active' } }),
      SubscriptionCompany.count({ where: { status: 'suspended' } }),
      MobileUser.count({ where: { companyId: { [Op.ne]: null }, status: { [Op.ne]: 'deleted' } } })
    ]);

    res.json({
      success: true,
      companies: rows.map(serializeCompany),
      summary: { total, active, suspended, users },
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Error fetching subscription companies:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch companies' });
  }
});

router.post('/', authenticate, requirePermission('companies.create'), async (req, res) => {
  const payload = cleanCompanyPayload(req.body);
  if (!payload.name) return res.status(400).json({ success: false, message: 'Company name is required' });

  try {
    const company = await sequelize.transaction(async transaction => {
      const created = await SubscriptionCompany.create({ ...payload, createdBy: req.user.id, status: 'active' }, { transaction });
      await CompanyWallet.create({ companyId: created.id, balance: 0, currency: 'NGN' }, { transaction });
      return created;
    });
    res.status(201).json({ success: true, message: 'Company created successfully', company });
  } catch (error) {
    logger.error('Error creating subscription company:', error);
    res.status(error.name === 'SequelizeValidationError' ? 400 : 500).json({ success: false, message: error.message || 'Failed to create company' });
  }
});

router.get('/:companyId/users', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId, { attributes: ['id', 'name', 'status'] });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const { page, limit, offset } = parsePage(req.query);
    const where = { companyId: company.id };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.search) {
      const search = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: search } },
        { email: { [Op.iLike]: search } },
        { phone: { [Op.iLike]: search } },
        { tagId: { [Op.iLike]: search } }
      ];
    }
    const { count, rows } = await MobileUser.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      include: [{ model: Wallet, as: 'wallet', attributes: ['id', 'balance', 'currency', 'isActive'], required: false }],
      order: [['name', 'ASC']],
      limit,
      offset,
      distinct: true
    });
    res.json({ success: true, company, users: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } });
  } catch (error) {
    logger.error('Error fetching company users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch company users' });
  }
});

router.post('/:companyId/users/assign', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const ids = Array.isArray(req.body.userIds) ? req.body.userIds : [req.body.mobileUserId];
    const userIds = [...new Set(ids.filter(Boolean).map(Number).filter(Number.isInteger))];
    if (!userIds.length) return res.status(400).json({ success: false, message: 'At least one mobile user is required' });
    const users = await MobileUser.findAll({ where: { id: { [Op.in]: userIds } } });
    if (users.length !== userIds.length) return res.status(404).json({ success: false, message: 'One or more mobile users were not found' });
    const assignedElsewhere = users.find(user => user.companyId && Number(user.companyId) !== Number(company.id));
    if (assignedElsewhere) return res.status(409).json({ success: false, message: `${assignedElsewhere.name} is already assigned to another company` });
    await sequelize.transaction(async transaction => {
      const lockedUsers = await MobileUser.findAll({ where: { id: { [Op.in]: userIds } }, transaction, lock: transaction.LOCK.UPDATE });
      const lockedElsewhere = lockedUsers.find(user => user.companyId && Number(user.companyId) !== Number(company.id));
      if (lockedElsewhere) throw new Error(`${lockedElsewhere.name} is already assigned to another company`);
      await Promise.all(lockedUsers.map(async user => {
        await user.update({ companyId: company.id }, { transaction });
        await Wallet.findOrCreate({ where: { userId: user.id }, defaults: { userId: user.id, balance: 0, currency: 'NGN' }, transaction });
      }));
    });
    users.forEach(user => { user.companyId = company.id; });
    res.json({
      success: true,
      message: `${users.length} mobile user(s) assigned`,
      users: users.map(user => {
        const safeUser = user.toJSON();
        delete safeUser.password;
        return safeUser;
      })
    });
  } catch (error) {
    logger.error('Error assigning company users:', error);
    res.status(500).json({ success: false, message: 'Failed to assign mobile users' });
  }
});

router.post('/:companyId/users', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !phone || !email || !password) return res.status(400).json({ success: false, message: 'Name, phone, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    if (company.status !== 'active') return res.status(400).json({ success: false, message: 'Users can only be created for an active company' });
    const existing = await MobileUser.findOne({ where: { [Op.or]: [{ phone }, { email }] } });
    if (existing) return res.status(409).json({ success: false, message: 'A mobile user with that phone or email already exists' });
    const user = await sequelize.transaction(async transaction => {
      const baseTagId = phoneToTagId(phone) || `MOB${Date.now()}`;
      const [existingUserTag, existingAuthorizedTag] = await Promise.all([
        MobileUser.findOne({ where: { tagId: baseTagId }, transaction }),
        AuthorizedTag.findOne({ where: { tagId: baseTagId }, transaction })
      ]);
      const tagId = existingUserTag || existingAuthorizedTag
        ? `${baseTagId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        : baseTagId;
      const created = await MobileUser.create({ name, phone, email: String(email).toLowerCase(), password, tagId, companyId: company.id, active: true, status: 'active' }, { transaction });
      await Wallet.create({ userId: created.id, balance: 0, currency: 'NGN' }, { transaction });
      try {
        await AuthorizedTag.findOrCreate({ where: { tagId: created.tagId }, defaults: { tagId: created.tagId, status: 'Active', blocked: false }, transaction });
      } catch (tagError) {
        logger.warn(`Could not create authorized tag ${created.tagId}: ${tagError.message}`);
      }
      return created;
    });
    const safeUser = user.toJSON();
    delete safeUser.password;
    res.status(201).json({ success: true, message: 'Company mobile user created', user: safeUser });
  } catch (error) {
    logger.error('Error creating company mobile user:', error);
    res.status(error.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ success: false, message: error.message || 'Failed to create mobile user' });
  }
});

router.put('/:companyId/users/:userId/status', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'deleted'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid mobile user status' });
    const user = await MobileUser.findOne({ where: { id: req.params.userId, companyId: req.params.companyId } });
    if (!user) return res.status(404).json({ success: false, message: 'Company mobile user not found' });
    await user.update({ status, active: status === 'active', deletedAt: status === 'deleted' ? new Date() : null });
    const tag = await AuthorizedTag.findOne({ where: { tagId: user.tagId } });
    if (tag) await tag.update({ status: status === 'active' ? 'Active' : 'Blocked', blocked: status !== 'active' });
    const safeUser = user.toJSON();
    delete safeUser.password;
    res.json({ success: true, message: `Mobile user ${status} successfully`, user: safeUser });
  } catch (error) {
    logger.error('Error updating company mobile user:', error);
    res.status(500).json({ success: false, message: 'Failed to update mobile user status' });
  }
});

router.delete('/:companyId/users/:userId', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const user = await MobileUser.findOne({ where: { id: req.params.userId, companyId: req.params.companyId } });
    if (!user) return res.status(404).json({ success: false, message: 'Company mobile user not found' });
    await user.update({ companyId: null });
    res.json({ success: true, message: 'Mobile user unassigned from company' });
  } catch (error) {
    logger.error('Error unassigning company mobile user:', error);
    res.status(500).json({ success: false, message: 'Failed to unassign mobile user' });
  }
});

// Company portal accounts are deliberately separate from administrative users.
router.get('/:companyId/portal-users', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId, { attributes: ['id', 'name', 'status'] });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const users = await CompanyUser.findAll({
      where: { companyId: company.id },
      attributes: COMPANY_USER_ATTRIBUTES,
      order: [['role', 'ASC'], ['name', 'ASC']]
    });
    res.json({ success: true, company, users });
  } catch (error) {
    logger.error('Error fetching company portal users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch company portal users' });
  }
});

router.post('/:companyId/portal-users', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ['owner', 'manager', 'viewer'].includes(req.body.role) ? req.body.role : 'owner';
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Portal password must be at least 8 characters' });
    const existing = await CompanyUser.findOne({ where: { email } });
    if (existing) return res.status(409).json({ success: false, message: 'A portal account with that email already exists' });
    const user = await CompanyUser.create({ companyId: company.id, name, email, phone: req.body.phone || null, password, role, status: 'active' });
    res.status(201).json({ success: true, message: 'Company portal account created', user: serializeCompanyUser(user) });
  } catch (error) {
    logger.error('Error creating company portal user:', error);
    res.status(error.name === 'SequelizeUniqueConstraintError' ? 409 : 400).json({ success: false, message: error.message || 'Failed to create company portal account' });
  }
});

router.put('/:companyId/portal-users/:userId', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const user = await CompanyUser.findOne({ where: { id: req.params.userId, companyId: req.params.companyId } });
    if (!user) return res.status(404).json({ success: false, message: 'Company portal account not found' });
    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name || '').trim();
    if (req.body.email !== undefined) data.email = String(req.body.email || '').trim().toLowerCase();
    if (req.body.phone !== undefined) data.phone = req.body.phone ? String(req.body.phone).trim() : null;
    if (req.body.role !== undefined && ['owner', 'manager', 'viewer'].includes(req.body.role)) data.role = req.body.role;
    if (req.body.status !== undefined && ['active', 'suspended'].includes(req.body.status)) data.status = req.body.status;
    if (req.body.password) {
      if (String(req.body.password).length < 8) return res.status(400).json({ success: false, message: 'Portal password must be at least 8 characters' });
      data.password = String(req.body.password);
    }
    if (data.email) {
      const duplicate = await CompanyUser.findOne({ where: { email: data.email, id: { [Op.ne]: user.id } } });
      if (duplicate) return res.status(409).json({ success: false, message: 'A portal account with that email already exists' });
    }
    await user.update(data);
    res.json({ success: true, message: 'Company portal account updated', user: serializeCompanyUser(user) });
  } catch (error) {
    logger.error('Error updating company portal user:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update company portal account' });
  }
});

router.delete('/:companyId/portal-users/:userId', authenticate, requirePermission('companies.manage_users'), async (req, res) => {
  try {
    const user = await CompanyUser.findOne({ where: { id: req.params.userId, companyId: req.params.companyId } });
    if (!user) return res.status(404).json({ success: false, message: 'Company portal account not found' });
    const owners = await CompanyUser.count({ where: { companyId: user.companyId, role: 'owner', status: 'active' } });
    if (user.role === 'owner' && owners <= 1) return res.status(400).json({ success: false, message: 'Create another active owner before removing the last owner' });
    await user.destroy();
    res.json({ success: true, message: 'Company portal account removed' });
  } catch (error) {
    logger.error('Error deleting company portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to remove company portal account' });
  }
});

router.get('/:companyId/wallet/transactions', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId, { attributes: ['id', 'name'] });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const { page, limit, offset } = parsePage(req.query);
    const { count, rows } = await CompanyWalletTransaction.findAndCountAll({
      where: { companyId: company.id },
      include: [{ model: MobileUser, as: 'beneficiary', attributes: ['id', 'name', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });
    res.json({ success: true, transactions: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } });
  } catch (error) {
    logger.error('Error fetching company wallet history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch company wallet history' });
  }
});

router.post('/:companyId/wallet/fund', authenticate, requirePermission('companies.manage_wallet'), async (req, res) => {
  try {
    const result = await fundCompanyWallet({
      companyId: Number(req.params.companyId),
      amount: req.body.amount,
      method: ['offline', 'manual'].includes(req.body.method) ? req.body.method : 'offline',
      description: req.body.description || `Offline company wallet funding by ${req.user.username}`,
      performedBy: req.user.id,
      metadata: { source: 'admin_console' }
    });
    res.status(201).json({ success: true, message: 'Company wallet funded successfully', balance: result.newBalance, transaction: result.ledger });
  } catch (error) {
    logger.error('Error funding company wallet:', error);
    res.status(error.message === 'Company not found' ? 404 : 400).json({ success: false, message: error.message || 'Failed to fund company wallet' });
  }
});

router.post('/:companyId/wallet/fund/paystack', authenticate, requirePermission('companies.manage_wallet'), async (req, res) => {
  let pending;
  try {
    const company = await SubscriptionCompany.findByPk(req.params.companyId, { attributes: ['id', 'name', 'email'] });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const amount = Number(req.body.amount);
    const email = String(req.body.email || company.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: 'A company email is required for gateway funding' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });

    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    if (!paystackSettings.secretKey) return res.status(503).json({ success: false, message: 'Payment service is not configured' });

    pending = await initializeCompanyGatewayFunding({
      companyId: Number(req.params.companyId),
      amount,
      method: 'paystack',
      description: req.body.description || 'Company wallet funding via Paystack',
      performedBy: req.user.id,
      metadata: { source: 'admin_console', email }
    });

    const callbackUrl = req.body.callbackUrl || process.env.COMPANY_PAYMENT_CALLBACK_URL || undefined;
    const response = await paystackRequest({
      method: 'POST',
      path: '/transaction/initialize',
      secretKey: paystackSettings.secretKey,
      payload: {
        amount: Math.round(amount * 100),
        email,
        reference: pending.ledger.reference,
        currency: 'NGN',
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
          companyId: Number(req.params.companyId),
          companyWalletTransactionId: pending.ledger.id,
          custom_fields: [{ display_name: 'Company wallet funding', variable_name: 'company_wallet_funding', value: 'true' }]
        }
      }
    });
    if (!response.body.status || !response.body.data?.authorization_url) {
      await settleCompanyGatewayFunding({ companyId: Number(req.params.companyId), reference: pending.ledger.reference, status: 'FAILED', gatewayResponse: response.body });
      return res.status(400).json({ success: false, message: response.body.message || 'Payment initialization failed' });
    }
    await pending.ledger.update({ metadata: { ...(pending.ledger.metadata || {}), email, initializeResponse: response.body } });
    return res.status(201).json({
      success: true,
      message: 'Payment initialized',
      reference: pending.ledger.reference,
      authorization_url: response.body.data.authorization_url,
      access_code: response.body.data.access_code
    });
  } catch (error) {
    logger.error('Error initializing company Paystack funding:', error);
    if (pending?.ledger) {
      try {
        await settleCompanyGatewayFunding({ companyId: Number(req.params.companyId), reference: pending.ledger.reference, status: 'FAILED', gatewayResponse: { message: error.message } });
      } catch (settleError) {
        logger.error('Error marking company Paystack funding failed:', settleError);
      }
    }
    return res.status(error.message === 'Company not found' ? 404 : 502).json({ success: false, message: error.message || 'Failed to initialize payment' });
  }
});

router.get('/:companyId/wallet/fund/paystack/verify', authenticate, requirePermission('companies.manage_wallet'), async (req, res) => {
  try {
    const reference = String(req.query.reference || req.query.trxref || '').trim();
    if (!reference) return res.status(400).json({ success: false, message: 'Payment reference is required' });
    const paystackSettings = await PaymentSettings.getCategorySettings('paystack');
    if (!paystackSettings.secretKey) return res.status(503).json({ success: false, message: 'Payment service is not configured' });
    const response = await paystackRequest({
      method: 'GET',
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      secretKey: paystackSettings.secretKey
    });
    const companyId = Number(req.params.companyId);
    if (!response.body.status || response.body.data?.status !== 'success') {
      await settleCompanyGatewayFunding({ companyId, reference, status: 'FAILED', gatewayResponse: response.body });
      return res.status(400).json({ success: false, message: response.body.message || 'Payment verification failed' });
    }
    const result = await settleCompanyGatewayFunding({
      companyId,
      reference,
      status: 'SUCCESS',
      verifiedAmount: response.body.data.amount,
      gatewayResponse: response.body
    });
    return res.json({ success: true, message: result.alreadyProcessed ? 'Payment already applied' : 'Company wallet funded successfully', balance: result.balance, transaction: result.ledger });
  } catch (error) {
    logger.error('Error verifying company Paystack funding:', error);
    return res.status(error.message === 'Company wallet funding transaction not found' ? 404 : 400).json({ success: false, message: error.message || 'Failed to verify payment' });
  }
});

router.post('/:companyId/wallet/transfer', authenticate, requirePermission('companies.manage_wallet'), async (req, res) => {
  try {
    const result = await transferCompanyFundsToUser({
      companyId: Number(req.params.companyId),
      mobileUserId: Number(req.body.mobileUserId),
      amount: req.body.amount,
      description: req.body.description || `Manual company funding by ${req.user.username}`,
      performedBy: req.user.id
    });
    const { user, company, companyWallet, userWallet, ...transfer } = result;
    res.status(201).json({
      success: true,
      message: 'Mobile user wallet funded successfully',
      result: {
        ...transfer,
        user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
        company: company ? { id: company.id, name: company.name, status: company.status } : null,
        companyWallet: companyWallet ? { id: companyWallet.id, balance: companyWallet.balance, currency: companyWallet.currency } : null,
        userWallet: userWallet ? { id: userWallet.id, balance: userWallet.balance, currency: userWallet.currency } : null
      }
    });
  } catch (error) {
    logger.error('Error transferring company funds:', error);
    res.status(error.code === 'INSUFFICIENT_COMPANY_BALANCE' ? 400 : 400).json({ success: false, message: error.message || 'Failed to fund mobile user wallet' });
  }
});

router.get('/:companyId/funding-rules', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const rules = await CompanyFundingRule.findAll({
      where: { companyId: req.params.companyId },
      include: [{ model: MobileUser, as: 'mobileUser', attributes: ['id', 'name', 'email'], required: false }],
      order: [['active', 'DESC'], ['nextRunAt', 'ASC']]
    });
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('Error fetching company funding rules:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch funding rules' });
  }
});

router.post('/:companyId/funding-rules', authenticate, requirePermission('companies.manage_funding'), async (req, res) => {
  try {
    const { frequency, amount, startDate, endDate, mobileUserId, notes, nextRunAt: requestedNextRun } = req.body;
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) return res.status(400).json({ success: false, message: 'Invalid funding frequency' });
    if (!startDate) return res.status(400).json({ success: false, message: 'Start date is required' });
    if (Number(amount) <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    const company = await SubscriptionCompany.findByPk(req.params.companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    if (mobileUserId) {
      const user = await MobileUser.findOne({ where: { id: mobileUserId, companyId: company.id } });
      if (!user) return res.status(400).json({ success: false, message: 'Selected mobile user does not belong to this company' });
    }
    const firstRun = requestedNextRun ? new Date(requestedNextRun) : new Date(`${startDate}T00:00:00.000Z`);
    if (Number.isNaN(firstRun.getTime())) return res.status(400).json({ success: false, message: 'Invalid first run date' });
    const rule = await CompanyFundingRule.create({ companyId: company.id, mobileUserId: mobileUserId || null, frequency, amount: Number(amount), startDate, endDate: endDate || null, nextRunAt: firstRun, active: true, notes: notes || null, createdBy: req.user.id });
    res.status(201).json({ success: true, message: 'Funding rule created', rule });
  } catch (error) {
    logger.error('Error creating company funding rule:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to create funding rule' });
  }
});

router.put('/:companyId/funding-rules/:ruleId', authenticate, requirePermission('companies.manage_funding'), async (req, res) => {
  try {
    const rule = await CompanyFundingRule.findOne({ where: { id: req.params.ruleId, companyId: req.params.companyId } });
    if (!rule) return res.status(404).json({ success: false, message: 'Funding rule not found' });
    const allowed = ['frequency', 'amount', 'startDate', 'endDate', 'active', 'notes', 'nextRunAt'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    if (data.frequency && !['daily', 'weekly', 'monthly', 'yearly'].includes(data.frequency)) return res.status(400).json({ success: false, message: 'Invalid funding frequency' });
    if (data.amount !== undefined && Number(data.amount) <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    await rule.update(data);
    res.json({ success: true, message: 'Funding rule updated', rule });
  } catch (error) {
    logger.error('Error updating company funding rule:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update funding rule' });
  }
});

router.delete('/:companyId/funding-rules/:ruleId', authenticate, requirePermission('companies.manage_funding'), async (req, res) => {
  try {
    const rule = await CompanyFundingRule.findOne({ where: { id: req.params.ruleId, companyId: req.params.companyId } });
    if (!rule) return res.status(404).json({ success: false, message: 'Funding rule not found' });
    await rule.update({ active: false });
    res.json({ success: true, message: 'Funding rule disabled' });
  } catch (error) {
    logger.error('Error disabling company funding rule:', error);
    res.status(500).json({ success: false, message: 'Failed to disable funding rule' });
  }
});

router.post('/:id/status', authenticate, requirePermission('companies.suspend'), async (req, res) => {
  try {
    if (!['active', 'suspended', 'inactive'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid company status' });
    const company = await SubscriptionCompany.findByPk(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    await company.update({ status: req.body.status });
    res.json({ success: true, message: `Company ${req.body.status}`, company });
  } catch (error) {
    logger.error('Error updating company status:', error);
    res.status(500).json({ success: false, message: 'Failed to update company status' });
  }
});

router.get('/:id', authenticate, requirePermission('companies.view'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.id, {
      attributes: COMPANY_ATTRIBUTES,
      include: [
        { model: CompanyWallet, as: 'wallet', required: false },
        { model: MobileUser, as: 'mobileUsers', attributes: { exclude: ['password'] }, include: [{ model: Wallet, as: 'wallet', attributes: ['id', 'balance', 'currency', 'isActive'], required: false }], required: false },
        { model: CompanyFundingRule, as: 'fundingRules', include: [{ model: MobileUser, as: 'mobileUser', attributes: ['id', 'name', 'email'], required: false }], required: false }
      ]
    });
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const [credits, debits, transactionCount] = await Promise.all([
      CompanyWalletTransaction.sum('amount', { where: { companyId: company.id, type: 'CREDIT', status: 'SUCCESS' } }),
      CompanyWalletTransaction.sum('amount', { where: { companyId: company.id, type: 'DEBIT', status: 'SUCCESS' } }),
      CompanyWalletTransaction.count({ where: { companyId: company.id } })
    ]);
    res.json({
      success: true,
      company: {
        ...serializeCompany(company),
        stats: {
          totalCredits: Number(credits || 0),
          totalUserFunding: Number(debits || 0),
          walletTransactions: transactionCount,
          activeUsers: (company.mobileUsers || []).filter(user => user.status === 'active' && user.active).length,
          activeRules: (company.fundingRules || []).filter(rule => rule.active).length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching company:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch company details' });
  }
});

router.put('/:id', authenticate, requirePermission('companies.update'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    const payload = cleanCompanyPayload(req.body);
    if (!payload.name) return res.status(400).json({ success: false, message: 'Company name is required' });
    await company.update(payload);
    res.json({ success: true, message: 'Company updated successfully', company });
  } catch (error) {
    logger.error('Error updating company:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update company' });
  }
});

router.delete('/:id', authenticate, requirePermission('companies.delete'), async (req, res) => {
  try {
    const company = await SubscriptionCompany.findByPk(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    await company.update({ status: 'inactive' });
    res.json({ success: true, message: 'Company archived successfully' });
  } catch (error) {
    logger.error('Error archiving company:', error);
    res.status(500).json({ success: false, message: 'Failed to archive company' });
  }
});

module.exports = router;
