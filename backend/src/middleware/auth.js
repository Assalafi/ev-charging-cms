const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const config = require('../../../config/backend').backend;

/**
 * Authentication middleware
 * Verifies JWT token and attaches user data to request
 */
function authenticate(req, res, next) {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Special case for development testing
  if (process.env.NODE_ENV !== 'production' && config.security.devMockToken && token === config.security.devMockToken) {
    logger.warn('Using development mock token - INSECURE FOR PRODUCTION');
    // Create a mock admin user for development
    req.user = config.security.devMockUser || {
      id: 1,
      email: 'admin@example.com',
      role: 'admin',
      name: 'Development Admin'
    };
    return next();
  }
  
  try {
    // Verify token with consistent secret
    const secret = process.env.JWT_SECRET || config.security.jwtSecret || 'ev-charging-secure-secret';
    const decoded = jwt.verify(token, secret);
    
    // Ensure the decoded token has required fields
    if (!decoded.id || !decoded.username) {
      throw new Error('Invalid token payload');
    }
    
    // Attach user data to request
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      message: 'Invalid authentication token' 
    });
  }
}

/**
 * Authorization middleware
 * Checks if user has required role(s)
 * @param {string|string[]} roles - Required role(s)
 */
function authorize(roles = []) {
  // Convert string to array
  if (typeof roles === 'string') {
    roles = [roles];
  }
  
  return [
    authenticate,
    (req, res, next) => {
      if (roles.length && !roles.includes(req.user.role)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      next();
    }
  ];
}

module.exports = { authenticate, authorize };
