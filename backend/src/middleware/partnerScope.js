const PARTNER_ROLES = new Set([
  'partner_owner',
  'partner_manager',
  'partner_finance',
  'partner_viewer'
]);

/**
 * Middleware to ensure user is a partner (has partnerId)
 * Partner users have partnerId set, admin users have partnerId = null
 */
async function partnerOnly(req, res, next) {
  if (!req.user || !req.user.partnerId || !PARTNER_ROLES.has(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Partner access required'
    });
  }

  try {
    const { User, PartnerCompany } = require('../models');
    const [user, partner] = await Promise.all([
      User.findByPk(req.user.id, {
        attributes: ['id', 'active', 'role', 'partnerId']
      }),
      PartnerCompany.findByPk(req.user.partnerId, {
        attributes: ['id', 'status']
      })
    ]);

    if (
      !user ||
      !user.active ||
      user.partnerId !== req.user.partnerId ||
      !PARTNER_ROLES.has(user.role) ||
      !partner ||
      partner.status !== 'active'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Partner account is inactive or suspended'
      });
    }

    req.partnerId = req.user.partnerId;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware to ensure user is an admin (does NOT have partnerId)
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.partnerId !== null) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
}

/**
 * Middleware to add partner scoping to queries
 * This should be used AFTER authentication to automatically filter queries by partnerId
 */
function scopePartner(req, res, next) {
  // Add partnerId to request for use in queries
  req.partnerId = req.user?.partnerId || null;
  next();
}

module.exports = {
  PARTNER_ROLES,
  partnerOnly,
  adminOnly,
  scopePartner
};
