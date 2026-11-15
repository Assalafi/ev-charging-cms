/**
 * Middleware to enforce valid pricing settings
 * Will force logout if pricing settings are not available
 */
const { validatePricingSettings } = require('../utils/pricingValidator');

/**
 * Middleware that enforces valid pricing settings
 * If pricing settings are invalid or missing, returns a 503 error
 * The frontend will handle this by logging out the user
 */
async function pricingValidationMiddleware(req, res, next) {
  try {
    // Pricing is no longer a platform-wide prerequisite: locations, companies
    // and authentication can use their own tariff context. Charging/billing
    // handlers validate pricing at the point where a price is actually needed.
    // Keep the old gate available only for an explicit legacy deployment.
    if (process.env.ENFORCE_GLOBAL_PRICING !== 'true') return next();

    // Skip pricing validation for certain routes
    const skipValidationRoutes = [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/settings/pricing', // Allow access to pricing settings route
      '/api/health'
    ];
    
    // Skip for certain prefixes (like static assets)
    const skipValidationPrefixes = [
      '/static/',
      '/assets/'
    ];
    
    // Check if we should skip validation
    const shouldSkip = req.path.startsWith('/api/auth/') ||
                      skipValidationRoutes.includes(req.path) ||
                      skipValidationPrefixes.some(prefix => req.path.startsWith(prefix));
    
    if (shouldSkip) {
      return next();
    }

    // Perform pricing validation
    const { isValid, error } = await validatePricingSettings(`middleware:${req.path}`);
    
    if (!isValid) {
      return res.status(503).json({
        error: 'Pricing Configuration Error',
        message: 'The system cannot operate because pricing settings are missing or invalid.',
        details: error,
        forceLogout: true // Signal to frontend that user should be logged out
      });
    }
    
    // Pricing is valid, continue
    next();
  } catch (err) {
    console.error('Error in pricing validation middleware:', err);
    return res.status(503).json({
      error: 'Pricing Validation Error',
      message: 'An error occurred while validating pricing settings.',
      forceLogout: true
    });
  }
}

module.exports = pricingValidationMiddleware;
