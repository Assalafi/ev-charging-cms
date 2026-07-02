const logger = require('../utils/logger');

/**
 * Middleware to ensure user is a partner (has partnerId)
 * Partner users have partnerId set, admin users have partnerId = null
 */
function partnerOnly(req, res, next) {
  if (!req.user || !req.user.partnerId) {
    return res.status(403).json({
      success: false,
      message: 'Partner access required'
    });
  }
  next();
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
  partnerOnly,
  adminOnly,
  scopePartner
};
