const express = require('express');
const { Op } = require('sequelize');
const {
  SubscriptionCompany, CompanyUser, CompanyWallet, CompanyWalletTransaction, CompanyFundingRule,
  MobileUser, Wallet, PaymentTransaction, AuthorizedTag, PaymentSettings, Location, ChargingStation, Connector, Transaction, sequelize
} = require('../../models');
const { companyAuthenticate, companyAuthorize } = require('../../middleware/companyAuth');
const { getPartnerDateRange } = require('../../utils/partnerDateRange');
const { parseLagosDate } = require('../../utils/timezone');
const { fundCompanyWallet, initializeCompanyGatewayFunding, settleCompanyGatewayFunding, transferCompanyFundsToUser, recoverUserFundsToCompany } = require('../../services/companyFundingService');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(companyAuthenticate);
const ONLINE = new Set(['Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing']);

function parsePage(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function safeMobileUser(user) {
  const value = user.toJSON ? user.toJSON() : user;
  const { password, ...safe } = value;
  return safe;
}

function paystackRequest({ method = 'GET', path, secretKey, payload }) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const request = https.request({ hostname: 'api.paystack.co', port: 443, path, method, headers: { Authorization: `Bearer ${secretKey}`, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) } }, response => {
      let data = ''; response.on('data', chunk => { data += chunk; });
      response.on('end', () => { try { resolve({ statusCode: response.statusCode, body: JSON.parse(data || '{}') }); } catch (error) { reject(new Error('Invalid payment gateway response')); } });
    });
    request.setTimeout(30000, () => request.destroy(new Error('Payment gateway request timed out')));
    request.on('error', reject); if (body) request.write(body); request.end();
  });
}

async function companyTags(companyId) {
  const users = await MobileUser.findAll({ where: { companyId, status: { [Op.ne]: 'deleted' } }, attributes: ['id', 'name', 'tagId', 'status', 'active'] });
  return { users, tags: users.map(user => user.tagId).filter(Boolean) };
}

router.get('/dashboard', async (req, res) => {
  try {
    const companyId = req.companyId;
    const { users, tags } = await companyTags(companyId);
    const today = getPartnerDateRange({ range: 'daily' });
    const month = getPartnerDateRange({ range: 'monthly' });
    const [wallet, todayLedger, monthLedger, rules, recentTransactions, usageRows] = await Promise.all([
      CompanyWallet.findOne({ where: { companyId } }),
      CompanyWalletTransaction.findAll({ where: { companyId, status: 'SUCCESS', createdAt: { [Op.between]: [today.start, today.end] } }, attributes: ['type', 'amount'] }),
      CompanyWalletTransaction.findAll({ where: { companyId, status: 'SUCCESS', createdAt: { [Op.between]: [month.start, month.end] } }, attributes: ['type', 'amount'] }),
      CompanyFundingRule.count({ where: { companyId, active: true } }),
      CompanyWalletTransaction.findAll({ where: { companyId }, include: [{ model: MobileUser, as: 'beneficiary', attributes: ['id', 'name'], required: false }], order: [['createdAt', 'DESC']], limit: 8 }),
      tags.length ? sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd) AS today_sessions,
          COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd), 0) AS today_energy,
          COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd), 0) AS today_spend,
          COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd) AS month_sessions,
          COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd), 0) AS month_energy,
          COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd), 0) AS month_spend,
          COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress')) AS lifetime_sessions,
          COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress')), 0) AS lifetime_energy,
          COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress')), 0) AS lifetime_spend,
          COUNT(*) FILTER (WHERE status = 'InProgress') AS active_sessions
        FROM transactions WHERE "idTag" IN (:tags)
      `, { replacements: { tags, todayStart: today.start, todayEnd: today.end, monthStart: month.start, monthEnd: month.end }, type: sequelize.QueryTypes.SELECT }).then(rows => rows[0]) : {}
    ]);
    const sumLedger = rows => rows.reduce((result, row) => { result[row.type === 'CREDIT' ? 'credits' : 'debits'] += Number(row.amount) || 0; return result; }, { credits: 0, debits: 0 });
    const todayTotals = sumLedger(todayLedger); const monthTotals = sumLedger(monthLedger);
    const number = key => Number(usageRows?.[key]) || 0;
    res.json({ success: true, generatedAt: new Date().toISOString(), dashboard: {
      company: req.company, walletBalance: Number(wallet?.balance || 0), currency: wallet?.currency || 'NGN',
      users: { total: users.length, active: users.filter(user => user.active && user.status === 'active').length, suspended: users.filter(user => user.status === 'suspended').length },
      funding: { today: todayTotals, month: monthTotals }, rules, activeSessions: number('active_sessions'),
      usage: { today: { sessions: number('today_sessions'), energyWh: number('today_energy'), spend: number('today_spend') }, month: { sessions: number('month_sessions'), energyWh: number('month_energy'), spend: number('month_spend') }, lifetime: { sessions: number('lifetime_sessions'), energyWh: number('lifetime_energy'), spend: number('lifetime_spend') } }, recentTransactions
    }});
  } catch (error) { logger.error('Company dashboard error:', error); res.status(500).json({ success: false, message: 'Failed to load company dashboard' }); }
});

router.get('/monitor', async (req, res) => {
  try {
    const locations = await Location.findAll({ where: { active: { [Op.ne]: false } }, attributes: ['id', 'name', 'address', 'city', 'state', 'country', 'latitude', 'longitude'], include: [{ model: ChargingStation, as: 'stations', attributes: ['id', 'chargePointId', 'name', 'status', 'locationId', 'connectorCount', 'lastHeartbeat', 'lastConnection', 'errorCode'], include: [{ model: Connector, attributes: ['connectorId', 'status', 'soc', 'lastStatusUpdate'], required: false }], required: false }], order: [['name', 'ASC']] });
    const data = locations.map(location => { const json = location.toJSON(); const stations = (json.stations || []).map(station => ({ ...station, isOnline: ONLINE.has(station.status) })); return { ...json, stations, stationCount: stations.length, onlineStations: stations.filter(station => station.isOnline).length, offlineStations: stations.filter(station => !station.isOnline).length }; });
    res.json({ success: true, generatedAt: new Date().toISOString(), locations: data });
  } catch (error) { logger.error('Company monitor error:', error); res.status(500).json({ success: false, message: 'Failed to load company monitor' }); }
});

router.get('/users', async (req, res) => {
  try {
    const { page, limit, offset } = parsePage(req.query); const where = { companyId: req.companyId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.search) { const search = `%${String(req.query.search).trim()}%`; where[Op.or] = [{ name: { [Op.iLike]: search } }, { email: { [Op.iLike]: search } }, { phone: { [Op.iLike]: search } }, { tagId: { [Op.iLike]: search } }]; }
    const [result, statusRows] = await Promise.all([
      MobileUser.findAndCountAll({ where, attributes: { exclude: ['password'] }, include: [{ model: Wallet, as: 'wallet', attributes: ['id', 'balance', 'currency', 'isActive'], required: false }], order: [['name', 'ASC']], limit, offset, distinct: true }),
      MobileUser.findAll({ where: { companyId: req.companyId }, attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true })
    ]);
    const stats = statusRows.reduce((summary, row) => {
      const count = Number(row.count) || 0;
      summary.total += count;
      if (row.status === 'active') summary.active = count;
      if (row.status === 'suspended') summary.suspended = count;
      if (row.status === 'deleted') summary.deleted = count;
      return summary;
    }, { total: 0, active: 0, suspended: 0, deleted: 0 });
    res.json({ success: true, users: result.rows, stats, pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) } });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to load company users' }); }
});

/**
 * Driver activity is deliberately scoped through the authenticated company.
 * Each activity stream has its own pagination so a busy driver does not make
 * the users page download an unbounded transaction history.
 */
router.get('/users/:userId/activity', async (req, res) => {
  try {
    const user = await MobileUser.findOne({
      where: { id: req.params.userId, companyId: req.companyId },
      attributes: { exclude: ['password'] },
      include: [{ model: Wallet, as: 'wallet', attributes: ['id', 'balance', 'currency', 'isActive'], required: false }]
    });
    if (!user) return res.status(404).json({ success: false, message: 'Company mobile user not found' });

    const section = ['charging', 'funding', 'wallet'].includes(String(req.query.section))
      ? String(req.query.section)
      : 'all';
    const { page, limit, offset } = parsePage(req.query);
    // Include manually stopped sessions as well: they are billable records and
    // should remain part of the driver's lifetime energy and spend totals.
    const billableStatuses = { [Op.in]: ['Completed', 'Stopped', 'InProgress'] };
    const transactionWhere = { idTag: user.tagId };
    const fundingWhere = { companyId: req.companyId, beneficiaryUserId: user.id, status: 'SUCCESS' };
    const walletWhere = { userId: user.id };

    const pageResult = async kind => {
      if (kind === 'charging') {
        const result = await Transaction.findAndCountAll({
          where: transactionWhere,
          // Transaction history is keyed by chargePointId. Resolve stations
          // separately instead of relying on the legacy chargingStationId
          // association, which is not present in every production schema.
          include: [{ model: Location, as: 'location', attributes: ['id', 'name', 'city', 'state'], required: false }],
          order: [['startTime', 'DESC']], limit, offset, distinct: true
        });
        const ids = [...new Set(result.rows.map(row => row.chargePointId).filter(Boolean))];
        const stations = ids.length ? await ChargingStation.findAll({ where: { chargePointId: { [Op.in]: ids } }, attributes: ['chargePointId', 'name', 'status'] }) : [];
        const stationById = new Map(stations.map(station => [station.chargePointId, station.toJSON()]));
        return { ...result, rows: result.rows.map(row => ({ ...row.toJSON(), charging_station: stationById.get(row.chargePointId) || null })) };
      }
      if (kind === 'funding') {
        return CompanyWalletTransaction.findAndCountAll({ where: fundingWhere, order: [['createdAt', 'DESC']], limit, offset });
      }
      return PaymentTransaction.findAndCountAll({ where: walletWhere, order: [['createdAt', 'DESC']], limit, offset });
    };

    const [sessions, energyWh, chargingValue, activeSessions, companyFunded, fundingCount, walletCredits, walletDebits] = await Promise.all([
      Transaction.count({ where: transactionWhere }),
      Transaction.sum('energyDelivered', { where: { ...transactionWhere, status: billableStatuses } }),
      Transaction.sum('amount', { where: { ...transactionWhere, status: billableStatuses } }),
      Transaction.count({ where: { ...transactionWhere, status: 'InProgress' } }),
      CompanyWalletTransaction.sum('amount', { where: { ...fundingWhere, type: 'DEBIT' } }),
      CompanyWalletTransaction.count({ where: { ...fundingWhere, type: 'DEBIT' } }),
      PaymentTransaction.sum('amount', { where: { ...walletWhere, type: 'CREDIT', status: 'SUCCESS' } }),
      PaymentTransaction.sum('amount', { where: { ...walletWhere, type: 'DEBIT', status: 'SUCCESS' } })
    ]);

    const summary = {
      sessions,
      activeSessions,
      energyWh: Number(energyWh) || 0,
      chargingValue: Number(chargingValue) || 0,
      companyFunded: Number(companyFunded) || 0,
      fundingCount,
      walletCredits: Number(walletCredits) || 0,
      walletDebits: Number(walletDebits) || 0
    };
    const baseResponse = { success: true, user, summary, generatedAt: new Date().toISOString() };

    if (section === 'all') {
      const [charging, funding, wallet] = await Promise.all([pageResult('charging'), pageResult('funding'), pageResult('wallet')]);
      const serialize = result => ({ rows: result.rows, pagination: { page: 1, limit, total: result.count, pages: Math.ceil(result.count / limit) } });
      return res.json({ ...baseResponse, activities: { charging: serialize(charging), funding: serialize(funding), wallet: serialize(wallet) } });
    }

    const result = await pageResult(section);
    res.json({ ...baseResponse, activities: { [section]: { rows: result.rows, pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) } } } });
  } catch (error) {
    logger.error('Company driver activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to load driver activity' });
  }
});

router.post('/users', ...companyAuthorize(['owner', 'manager']), async (req, res) => {
  try {
    const { name, phone, email, password } = req.body; if (!name || !phone || !email || !password) return res.status(400).json({ success: false, message: 'Name, phone, email and password are required' });
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const company = await SubscriptionCompany.findByPk(req.companyId); if (!company || company.status !== 'active') return res.status(400).json({ success: false, message: 'Company is not active' });
    const normalizedEmail = String(email).trim().toLowerCase(); const existing = await MobileUser.findOne({ where: { [Op.or]: [{ phone: String(phone).trim() }, { email: normalizedEmail }] } }); if (existing) return res.status(409).json({ success: false, message: 'A mobile user with that phone or email already exists' });
    const digits = String(phone).replace(/\D/g, ''); const baseTagId = `MOB${digits.slice(-10) || Date.now()}`; const [tagCollision, authorizedTagCollision] = await Promise.all([MobileUser.findOne({ where: { tagId: baseTagId } }), AuthorizedTag.findOne({ where: { tagId: baseTagId } })]); const tagId = tagCollision || authorizedTagCollision ? `${baseTagId}-${Date.now().toString(36)}` : baseTagId;
    const user = await sequelize.transaction(async transaction => { const created = await MobileUser.create({ name: String(name).trim(), phone: String(phone).trim(), email: normalizedEmail, password, tagId, companyId: req.companyId, active: true, status: 'active' }, { transaction }); await Wallet.create({ userId: created.id, balance: 0, currency: 'NGN' }, { transaction }); await AuthorizedTag.findOrCreate({ where: { tagId }, defaults: { tagId, status: 'Active', blocked: false }, transaction }); return created; });
    res.status(201).json({ success: true, message: 'Mobile user created', user: safeMobileUser(user) });
  } catch (error) { logger.error('Company create mobile user error:', error); res.status(error.name === 'SequelizeUniqueConstraintError' ? 409 : 400).json({ success: false, message: error.message || 'Failed to create mobile user' }); }
});

router.put('/users/:userId/status', ...companyAuthorize(['owner', 'manager']), async (req, res) => {
  const status = req.body.status; if (!['active', 'suspended', 'deleted'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid user status' });
  try { const user = await MobileUser.findOne({ where: { id: req.params.userId, companyId: req.companyId } }); if (!user) return res.status(404).json({ success: false, message: 'Company mobile user not found' }); await user.update({ status, active: status === 'active', deletedAt: status === 'deleted' ? new Date() : null }); const tag = await AuthorizedTag.findOne({ where: { tagId: user.tagId } }); if (tag) await tag.update({ status: status === 'active' ? 'Active' : 'Blocked', blocked: status !== 'active' }); res.json({ success: true, message: `Mobile user ${status === 'deleted' ? 'deactivated' : status}`, user: safeMobileUser(user) }); } catch (error) { res.status(500).json({ success: false, message: 'Failed to update mobile user' }); }
});

router.post('/users/:userId/fund', ...companyAuthorize(['owner', 'manager']), async (req, res) => {
  try { const result = await transferCompanyFundsToUser({ companyId: req.companyId, mobileUserId: Number(req.params.userId), amount: req.body.amount, description: req.body.description || `Company funding by ${req.companyUser.name}`, performedBy: req.companyUser.id }); res.status(201).json({ success: true, message: 'Mobile user wallet funded', result: { amount: result.amount, reference: result.reference, companyBalance: result.newCompanyBalance, userBalance: result.newUserBalance, user: { id: result.user.id, name: result.user.name } } }); } catch (error) { res.status(400).json({ success: false, message: error.message || 'Failed to fund mobile user' }); }
});

router.post('/users/:userId/recover', ...companyAuthorize(['owner', 'manager']), async (req, res) => {
  try {
    const result = await recoverUserFundsToCompany({ companyId: req.companyId, mobileUserId: Number(req.params.userId), amount: req.body.amount, description: req.body.description || `Funds recovered by ${req.companyUser.name}`, performedBy: req.companyUser.id });
    res.status(201).json({ success: true, message: 'Funds recovered from mobile user wallet', result: { amount: result.amount, reference: result.reference, companyBalance: result.newCompanyBalance, userBalance: result.newUserBalance, user: { id: result.user.id, name: result.user.name } } });
  } catch (error) { res.status(400).json({ success: false, message: error.message || 'Failed to recover mobile user funds' }); }
});

router.get('/wallet', async (req, res) => { const wallet = await CompanyWallet.findOne({ where: { companyId: req.companyId } }); const balance = Number(wallet?.balance || 0); res.json({ success: true, wallet: { ...(wallet ? wallet.toJSON() : { balance: 0, currency: 'NGN' }), debtEnabled: req.company.debtEnabled === true, debtOutstanding: Math.max(0, -balance) } }); });
router.get('/wallet/transactions', async (req, res) => { const { page, limit, offset } = parsePage(req.query); const result = await CompanyWalletTransaction.findAndCountAll({ where: { companyId: req.companyId }, include: [{ model: MobileUser, as: 'beneficiary', attributes: ['id', 'name'], required: false }], order: [['createdAt', 'DESC']], limit, offset }); res.json({ success: true, transactions: result.rows, pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) } }); });

router.post('/wallet/fund/paystack', ...companyAuthorize(['owner', 'manager']), async (req, res) => {
  let pending; try { const amount = Number(req.body.amount); if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0' }); const email = String(req.body.email || req.company.email || '').trim().toLowerCase(); if (!email) return res.status(400).json({ success: false, message: 'A company email is required for gateway funding' }); const settings = await PaymentSettings.getCategorySettings('paystack'); if (!settings.secretKey) return res.status(503).json({ success: false, message: 'Payment service is not configured' }); pending = await initializeCompanyGatewayFunding({ companyId: req.companyId, amount, method: 'paystack', description: 'Company wallet funding via Paystack', performedBy: req.companyUser.id, metadata: { source: 'company_portal', email } }); const response = await paystackRequest({ method: 'POST', path: '/transaction/initialize', secretKey: settings.secretKey, payload: { amount: Math.round(amount * 100), email, reference: pending.ledger.reference, currency: 'NGN', ...(req.body.callbackUrl ? { callback_url: req.body.callbackUrl } : {}), metadata: { companyId: req.companyId, companyWalletTransactionId: pending.ledger.id } } }); if (!response.body.status || !response.body.data?.authorization_url) { await settleCompanyGatewayFunding({ companyId: req.companyId, reference: pending.ledger.reference, status: 'FAILED', gatewayResponse: response.body }); return res.status(400).json({ success: false, message: response.body.message || 'Payment initialization failed' }); } await pending.ledger.update({ metadata: { ...(pending.ledger.metadata || {}), initializeResponse: response.body } }); res.status(201).json({ success: true, reference: pending.ledger.reference, authorization_url: response.body.data.authorization_url }); } catch (error) { if (pending?.ledger) { try { await settleCompanyGatewayFunding({ companyId: req.companyId, reference: pending.ledger.reference, status: 'FAILED', gatewayResponse: { message: error.message } }); } catch (settleError) { logger.error('Company payment failure settlement error:', settleError); } } res.status(502).json({ success: false, message: error.message || 'Failed to initialize payment' }); }
});

router.get('/wallet/fund/paystack/verify', ...companyAuthorize(['owner', 'manager']), async (req, res) => { try { const reference = String(req.query.reference || req.query.trxref || '').trim(); if (!reference) return res.status(400).json({ success: false, message: 'Payment reference is required' }); const settings = await PaymentSettings.getCategorySettings('paystack'); const response = await paystackRequest({ method: 'GET', path: `/transaction/verify/${encodeURIComponent(reference)}`, secretKey: settings.secretKey }); if (!response.body.status || response.body.data?.status !== 'success') { await settleCompanyGatewayFunding({ companyId: req.companyId, reference, status: 'FAILED', gatewayResponse: response.body }); return res.status(400).json({ success: false, message: response.body.message || 'Payment verification failed' }); } const result = await settleCompanyGatewayFunding({ companyId: req.companyId, reference, status: 'SUCCESS', verifiedAmount: response.body.data.amount, gatewayResponse: response.body }); res.json({ success: true, message: result.alreadyProcessed ? 'Payment already applied' : 'Company wallet funded', balance: result.balance }); } catch (error) { res.status(400).json({ success: false, message: error.message || 'Failed to verify payment' }); } });

router.get('/funding-rules', async (req, res) => { const rules = await CompanyFundingRule.findAll({ where: { companyId: req.companyId }, include: [{ model: MobileUser, as: 'mobileUser', attributes: ['id', 'name', 'email'], required: false }], order: [['active', 'DESC'], ['nextRunAt', 'ASC']] }); res.json({ success: true, rules }); });
router.post('/funding-rules', ...companyAuthorize(['owner', 'manager']), async (req, res) => { try { const { frequency, amount, startDate, endDate, mobileUserId, notes, nextRunAt: requested } = req.body; if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) return res.status(400).json({ success: false, message: 'Invalid funding frequency' }); if (!startDate || Number(amount) <= 0) return res.status(400).json({ success: false, message: 'Start date and a positive amount are required' }); if (mobileUserId && !(await MobileUser.findOne({ where: { id: mobileUserId, companyId: req.companyId, status: 'active' } }))) return res.status(400).json({ success: false, message: 'Selected user does not belong to this company' }); const firstRun = requested ? new Date(requested) : parseLagosDate(startDate); if (Number.isNaN(firstRun.getTime())) return res.status(400).json({ success: false, message: 'Invalid first run date' }); const rule = await CompanyFundingRule.create({ companyId: req.companyId, mobileUserId: mobileUserId || null, frequency, amount: Number(amount), startDate, endDate: endDate || null, nextRunAt: firstRun, active: true, notes: notes || null, createdBy: req.companyUser.id }); res.status(201).json({ success: true, rule }); } catch (error) { res.status(400).json({ success: false, message: error.message || 'Failed to create funding rule' }); } });
router.put('/funding-rules/:ruleId', ...companyAuthorize(['owner', 'manager']), async (req, res) => { try { const rule = await CompanyFundingRule.findOne({ where: { id: req.params.ruleId, companyId: req.companyId } }); if (!rule) return res.status(404).json({ success: false, message: 'Funding rule not found' }); const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => ['frequency', 'amount', 'startDate', 'endDate', 'active', 'notes', 'nextRunAt'].includes(key))); if (data.frequency && !['daily', 'weekly', 'monthly', 'yearly'].includes(data.frequency)) return res.status(400).json({ success: false, message: 'Invalid funding frequency' }); if (data.amount !== undefined && Number(data.amount) <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than 0' }); await rule.update(data); res.json({ success: true, rule }); } catch (error) { res.status(400).json({ success: false, message: error.message || 'Failed to update funding rule' }); } });
router.delete('/funding-rules/:ruleId', ...companyAuthorize(['owner', 'manager']), async (req, res) => { const rule = await CompanyFundingRule.findOne({ where: { id: req.params.ruleId, companyId: req.companyId } }); if (!rule) return res.status(404).json({ success: false, message: 'Funding rule not found' }); await rule.update({ active: false }); res.json({ success: true, message: 'Funding rule disabled' }); });

module.exports = router;
