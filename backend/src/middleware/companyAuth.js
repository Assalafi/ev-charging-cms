const jwt = require('jsonwebtoken');
const config = require('../../../config/backend').backend;
const logger = require('../utils/logger');
const { CompanyUser, SubscriptionCompany } = require('../models');

function secret() {
  return process.env.JWT_SECRET || config.security.jwtSecret || 'ev-charging-secure-secret';
}

async function companyAuthenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Company authentication required' });
  try {
    const decoded = jwt.verify(header.slice(7), secret());
    if (!decoded.isCompany || !decoded.companyUserId || !decoded.companyId) throw new Error('Invalid company token');
    const user = await CompanyUser.findOne({
      where: { id: decoded.companyUserId, companyId: decoded.companyId },
      attributes: { exclude: ['password'] },
      include: [{ model: SubscriptionCompany, as: 'company', attributes: ['id', 'name', 'email', 'phone', 'address', 'city', 'state', 'country', 'status'] }]
    });
    if (!user || user.status !== 'active') return res.status(401).json({ success: false, message: 'Company account is suspended or no longer exists' });
    if (!user.company || user.company.status !== 'active') return res.status(403).json({ success: false, message: 'Company access is currently suspended' });
    req.companyUser = user.toJSON();
    req.company = user.company.toJSON();
    req.companyId = Number(user.companyId);
    next();
  } catch (error) {
    logger.warn(`Company authentication failed: ${error.message}`);
    res.status(401).json({ success: false, message: error.name === 'TokenExpiredError' ? 'Company session expired' : 'Invalid company authentication token' });
  }
}

function companyAuthorize(roles = []) {
  const allowed = typeof roles === 'string' ? [roles] : roles;
  return [companyAuthenticate, (req, res, next) => {
    if (allowed.length && !allowed.includes(req.companyUser.role)) return res.status(403).json({ success: false, message: 'Your company role cannot perform this action' });
    next();
  }];
}

module.exports = { companyAuthenticate, companyAuthorize };

