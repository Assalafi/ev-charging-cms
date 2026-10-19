const { Op, Sequelize } = require('sequelize');
const {
  SubscriptionCompany,
  CompanyWallet,
  CompanyWalletTransaction,
  CompanyFundingRule,
  MobileUser,
  Wallet,
  PaymentTransaction,
  sequelize
} = require('../models');
const logger = require('../utils/logger');
const { nextLagosRunAt, parseLagosDate } = require('../utils/timezone');

let schedulerHandle = null;
let schedulerRunning = false;

function numericAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  return Math.round(amount * 100) / 100;
}

async function getOrCreateCompanyWallet(companyId, transaction) {
  let wallet = await CompanyWallet.findOne({
    where: { companyId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!wallet) {
    wallet = await CompanyWallet.create({ companyId, balance: 0, currency: 'NGN' }, { transaction });
  }
  return wallet;
}

async function fundCompanyWallet({ companyId, amount, method = 'offline', description, performedBy, reference, metadata }) {
  const fundAmount = numericAmount(amount);
  return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const company = await SubscriptionCompany.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!company) throw new Error('Company not found');

    const wallet = await getOrCreateCompanyWallet(company.id, transaction);
    const previousBalance = Number(wallet.balance || 0);
    const newBalance = previousBalance + fundAmount;
    await wallet.update({ balance: newBalance }, { transaction });

    const ledger = await CompanyWalletTransaction.create({
      companyId: company.id,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: fundAmount,
      currency: wallet.currency || 'NGN',
      reference: reference || `COMPANY-CREDIT-${company.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method,
      status: 'SUCCESS',
      description: description || `Company wallet credit by ${method}`,
      metadata: { ...(metadata || {}), previousBalance, newBalance },
      performedBy: performedBy || null
    }, { transaction });

    return { company, wallet, ledger, previousBalance, newBalance };
  });
}

async function initializeCompanyGatewayFunding({ companyId, amount, method = 'paystack', description, performedBy, reference, metadata }) {
  const fundAmount = numericAmount(amount);
  return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const company = await SubscriptionCompany.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!company) throw new Error('Company not found');

    const wallet = await getOrCreateCompanyWallet(company.id, transaction);
    const ledger = await CompanyWalletTransaction.create({
      companyId: company.id,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: fundAmount,
      currency: wallet.currency || 'NGN',
      reference: reference || `COMPANY-${method.toUpperCase()}-${company.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method,
      status: 'PENDING',
      description: description || `Company wallet funding via ${method}`,
      metadata: metadata || {},
      performedBy: performedBy || null
    }, { transaction });

    return { company, wallet, ledger };
  });
}

async function settleCompanyGatewayFunding({ companyId, reference, status, gatewayResponse, verifiedAmount }) {
  return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const ledger = await CompanyWalletTransaction.findOne({
      where: { companyId, reference },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!ledger) throw new Error('Company wallet funding transaction not found');

    if (ledger.status === 'SUCCESS') {
      const wallet = await CompanyWallet.findByPk(ledger.walletId, { transaction, lock: transaction.LOCK.UPDATE });
      return { ledger, wallet, alreadyProcessed: true, balance: Number(wallet?.balance || 0) };
    }

    const existingMetadata = ledger.metadata && typeof ledger.metadata === 'object' ? ledger.metadata : {};
    if (status !== 'SUCCESS') {
      await ledger.update({
        status: 'FAILED',
        metadata: { ...existingMetadata, gatewayResponse }
      }, { transaction });
      return { ledger, wallet: null, alreadyProcessed: false, balance: null };
    }

    const expectedKobo = Math.round(Number(ledger.amount) * 100);
    if (verifiedAmount !== undefined && Number.isFinite(Number(verifiedAmount)) && Math.round(Number(verifiedAmount)) !== expectedKobo) {
      throw new Error('Payment amount does not match the company funding amount');
    }

    const wallet = await CompanyWallet.findByPk(ledger.walletId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!wallet) throw new Error('Company wallet not found');
    const previousBalance = Number(wallet.balance || 0);
    const newBalance = previousBalance + Number(ledger.amount);
    await wallet.update({ balance: newBalance }, { transaction });
    await ledger.update({
      status: 'SUCCESS',
      metadata: { ...existingMetadata, gatewayResponse, previousBalance, newBalance }
    }, { transaction });
    return { ledger, wallet, alreadyProcessed: false, balance: newBalance };
  });
}

async function transferCompanyFundsToUser({ companyId, mobileUserId, amount, fundingRuleId = null, description, performedBy }) {
  const transferAmount = numericAmount(amount);
  return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const company = await SubscriptionCompany.findByPk(companyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!company) throw new Error('Company not found');
    if (company.status !== 'active') throw new Error('Company is not active');

    const user = await MobileUser.findByPk(mobileUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || Number(user.companyId) !== Number(company.id)) {
      throw new Error('Mobile user is not assigned to this company');
    }
    if (!user.active || user.status !== 'active') throw new Error('Mobile user is not active');

    const companyWallet = await getOrCreateCompanyWallet(company.id, transaction);
    const companyBalance = Number(companyWallet.balance || 0);
    const debtEnabled = company.debtEnabled === true;
    if (companyBalance < transferAmount && !debtEnabled) {
      const error = new Error('Company wallet balance is insufficient');
      error.code = 'INSUFFICIENT_COMPANY_BALANCE';
      throw error;
    }

    let userWallet = await Wallet.findOne({
      where: { userId: user.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!userWallet) {
      userWallet = await Wallet.create({ userId: user.id, balance: 0, currency: 'NGN' }, { transaction });
    }

    const previousCompanyBalance = companyBalance;
    const newCompanyBalance = companyBalance - transferAmount;
    const debtAmount = Math.max(0, -newCompanyBalance);
    const previousUserBalance = Number(userWallet.balance || 0);
    const newUserBalance = previousUserBalance + transferAmount;
    const reference = `COMPANY-USER-${company.id}-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await companyWallet.update({ balance: newCompanyBalance }, { transaction });
    await userWallet.update({ balance: newUserBalance }, { transaction });

    await CompanyWalletTransaction.create({
      companyId: company.id,
      walletId: companyWallet.id,
      beneficiaryUserId: user.id,
      fundingRuleId,
      type: 'DEBIT',
      amount: transferAmount,
      currency: companyWallet.currency || 'NGN',
      reference,
      method: fundingRuleId ? 'auto_funding' : 'company_transfer',
      status: 'SUCCESS',
      description: description || `${debtAmount > 0 ? 'Debt funding' : 'Funding'} for ${user.name}`,
      metadata: {
        previousBalance: previousCompanyBalance,
        newBalance: newCompanyBalance,
        beneficiaryUserId: user.id,
        debtEnabled,
        debtAmount
      },
      performedBy: performedBy || null
    }, { transaction });

    await PaymentTransaction.create({
      userId: user.id,
      walletId: userWallet.id,
      type: 'CREDIT',
      amount: transferAmount,
      currency: userWallet.currency || 'NGN',
      reference,
      gateway: 'company',
      status: 'SUCCESS',
      description: description || `Company funding from ${company.name}`,
      metadata: {
        companyId: company.id,
        fundingRuleId,
        previousBalance: previousUserBalance,
        newBalance: newUserBalance
      }
    }, { transaction });

    return {
      company,
      user,
      companyWallet,
      userWallet,
      amount: transferAmount,
      previousCompanyBalance,
      newCompanyBalance,
      previousUserBalance,
      newUserBalance,
      debtEnabled,
      debtAmount,
      reference
    };
  });
}

/**
 * Move available funds from a company mobile user's wallet back to the
 * company's wallet. Both wallets and both ledgers are updated in one
 * serializable transaction so a concurrent charge or funding action cannot
 * overdraw the user's balance.
 */
async function recoverUserFundsToCompany({ companyId, mobileUserId, amount, description, performedBy }) {
  const recoveryAmount = numericAmount(amount);
  return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const company = await SubscriptionCompany.findByPk(companyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!company) throw new Error('Company not found');
    if (company.status !== 'active') throw new Error('Company is not active');

    const user = await MobileUser.findByPk(mobileUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || Number(user.companyId) !== Number(company.id) || user.status === 'deleted') {
      throw new Error('Mobile user is not assigned to this company');
    }

    const userWallet = await Wallet.findOne({
      where: { userId: user.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const previousUserBalance = Number(userWallet?.balance || 0);
    if (!userWallet || previousUserBalance < recoveryAmount) {
      const error = new Error(`Insufficient user wallet balance. Available: ₦${previousUserBalance.toFixed(2)}`);
      error.code = 'INSUFFICIENT_USER_BALANCE';
      throw error;
    }

    const companyWallet = await getOrCreateCompanyWallet(company.id, transaction);
    const previousCompanyBalance = Number(companyWallet.balance || 0);
    const newUserBalance = Math.round((previousUserBalance - recoveryAmount) * 100) / 100;
    const newCompanyBalance = Math.round((previousCompanyBalance + recoveryAmount) * 100) / 100;
    const reference = `COMPANY-USER-RECOVERY-${company.id}-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await userWallet.update({ balance: newUserBalance }, { transaction });
    await companyWallet.update({ balance: newCompanyBalance }, { transaction });

    await CompanyWalletTransaction.create({
      companyId: company.id,
      walletId: companyWallet.id,
      beneficiaryUserId: user.id,
      type: 'CREDIT',
      amount: recoveryAmount,
      currency: companyWallet.currency || 'NGN',
      reference,
      method: 'company_recovery',
      status: 'SUCCESS',
      description: description || `Funds recovered from ${user.name}`,
      metadata: {
        action: 'user_wallet_recovery',
        previousCompanyBalance,
        newCompanyBalance,
        previousUserBalance,
        newUserBalance,
        recoveredFromUserId: user.id
      },
      performedBy: performedBy || null
    }, { transaction });

    await PaymentTransaction.create({
      userId: user.id,
      walletId: userWallet.id,
      type: 'DEBIT',
      amount: recoveryAmount,
      currency: userWallet.currency || 'NGN',
      reference,
      gateway: 'company',
      status: 'SUCCESS',
      description: description || `Funds recovered by ${company.name}`,
      metadata: {
        action: 'company_recovery',
        companyId: company.id,
        previousBalance: previousUserBalance,
        newBalance: newUserBalance,
        companyPreviousBalance: previousCompanyBalance,
        companyNewBalance: newCompanyBalance
      }
    }, { transaction });

    return {
      company,
      user,
      companyWallet,
      userWallet,
      amount: recoveryAmount,
      previousCompanyBalance,
      newCompanyBalance,
      previousUserBalance,
      newUserBalance,
      reference
    };
  });
}

async function executeFundingRule(ruleId) {
  const rule = await CompanyFundingRule.findByPk(ruleId, {
    include: [
      { model: SubscriptionCompany, as: 'company' },
      { model: MobileUser, as: 'mobileUser', attributes: ['id', 'name', 'status', 'active', 'companyId'] }
    ]
  });
  if (!rule || !rule.active || !rule.company || rule.company.status !== 'active') return { skipped: true };

  const where = { companyId: rule.companyId, status: 'active', active: true };
  if (rule.mobileUserId) where.id = rule.mobileUserId;
  const users = await MobileUser.findAll({ where, attributes: ['id', 'name'] });
  const results = [];
  for (const user of users) {
    try {
      const result = await transferCompanyFundsToUser({
        companyId: rule.companyId,
        mobileUserId: user.id,
        amount: rule.amount,
        fundingRuleId: rule.id,
        description: `Automatic ${rule.frequency} funding for ${user.name}`
      });
      results.push({ userId: user.id, success: true, amount: result.amount });
    } catch (error) {
      logger.warn(`Company funding rule ${rule.id} skipped user ${user.id}: ${error.message}`);
      results.push({ userId: user.id, success: false, message: error.message });
    }
  }

  const now = new Date();
  const next = nextLagosRunAt(rule.frequency, now);
  const endReached = rule.endDate && next > parseLagosDate(rule.endDate, true);
  await rule.update({ lastRunAt: now, nextRunAt: next, active: !endReached });
  return { ruleId: rule.id, users: results, nextRunAt: next, active: !endReached };
}

async function runDueFundingRules() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const rules = await CompanyFundingRule.findAll({
      where: { active: true, nextRunAt: { [Op.lte]: new Date() } },
      order: [['nextRunAt', 'ASC']],
      limit: 100
    });
    for (const rule of rules) await executeFundingRule(rule.id);
  } catch (error) {
    logger.error('Company funding scheduler error:', error);
  } finally {
    schedulerRunning = false;
  }
}

function startCompanyFundingScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(runDueFundingRules, 60 * 1000);
  setTimeout(runDueFundingRules, 5000);
  logger.info('Company funding scheduler started (checking every 60 seconds)');
}

function stopCompanyFundingScheduler() {
  if (schedulerHandle) clearInterval(schedulerHandle);
  schedulerHandle = null;
}

module.exports = {
  nextRunAt: nextLagosRunAt,
  fundCompanyWallet,
  initializeCompanyGatewayFunding,
  settleCompanyGatewayFunding,
  transferCompanyFundsToUser,
  recoverUserFundsToCompany,
  executeFundingRule,
  runDueFundingRules,
  startCompanyFundingScheduler,
  stopCompanyFundingScheduler
};
