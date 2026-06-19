const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { MobileUser, AuthorizedTag, ChargingStation, Transaction, Connector, Location, Wallet } = require('../models');
const logger = require('../utils/logger');
const ocppServer = require('../ocpp/server');

const router = express.Router();

// Import wallet routes
const walletRoutes = require('./mobile/wallet');

// ─── Helper: get JWT secret ─────────────────────────────────────────────────
const getJwtSecret = () =>
  process.env.JWT_SECRET || 'ev-charging-secure-secret';

// ─── Middleware: authenticate mobile user ────────────────────────────────────
function mobileAuth(req, res, next) {
  logger.info('Mobile auth middleware called', { 
    path: req.path, 
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    authHeaderPrefix: req.headers.authorization?.split(' ')[0]
  });
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Mobile auth failed: No valid Bearer token', { path: req.path });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    logger.debug('Mobile auth: Verifying token', { path: req.path, tokenLength: token.length });
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded.id || !decoded.isMobile) {
      logger.warn('Mobile auth failed: Invalid mobile token structure', { path: req.path, decoded });
      throw new Error('Invalid mobile token');
    }
    logger.info('Mobile auth success', { path: req.path, userId: decoded.id, userEmail: decoded.email });
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Mobile auth error', { path: req.path, error: error.message, errorName: error.name });
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ─── Helper: generate tagId from phone ───────────────────────────────────────
function phoneToTagId(phone) {
  // Remove all non-digit characters, keep last 10 digits
  const digits = phone.replace(/\D/g, '');
  return 'MOB' + digits.slice(-10);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/mobile/auth/signup
 * @desc    Register a new mobile user (public)
 */
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword } = req.body;
    logger.debug('Mobile signup request received', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      body: { name, phone: phone ? phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2') : null, email }
    });

    // Validation
    if (!name || !phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Check for existing user
    const existingUser = await MobileUser.findOne({
      where: { [Op.or]: [{ phone }, { email }] }
    });
    if (existingUser) {
      const field = existingUser.phone === phone ? 'phone number' : 'email';
      return res.status(409).json({ success: false, message: `An account with this ${field} already exists` });
    }

    // Create tagId from phone
    const tagId = phoneToTagId(phone);

    // Create mobile user
    const user = await MobileUser.create({
      name,
      phone,
      email,
      password,
      tagId,
      active: true
    });

    // Create authorized tag for OCPP (use raw query to avoid ENUM/constraint issues)
    try {
      const existing = await AuthorizedTag.findOne({ where: { tagId } });
      if (!existing) {
        await AuthorizedTag.create({ tagId, status: 'Active', blocked: false });
      }
    } catch (tagErr) {
      logger.warn(`Could not create authorized tag ${tagId}: ${tagErr.message}`);
      // Non-fatal — user is still created
    }

    // Generate token (no expiry for remember-me by default; 24h for normal)
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, phone: user.phone, tagId: user.tagId, isMobile: true },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    logger.info(`Mobile user registered: ${email} (tagId: ${tagId})`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        tagId: user.tagId
      }
    });
  } catch (error) {
    logger.error('Mobile signup error:', error.message || error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      const friendly = field === 'phone' ? 'phone number' : field === 'email' ? 'email' : field;
      return res.status(409).json({ success: false, message: `An account with this ${friendly} already exists` });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /api/mobile/auth/login
 * @desc    Login mobile user by phone or email
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password, rememberMe } = req.body;
    logger.debug('Mobile login request received', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      identifier: identifier?.includes('@') ? identifier : identifier?.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2'),
      rememberMe
    });

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Phone/email and password are required' });
    }

    // Find user by phone or email
    const user = await MobileUser.findOne({
      where: { [Op.or]: [{ phone: identifier }, { email: identifier }] }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(401).json({ success: false, message: 'Account is disabled' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await user.update({ lastLogin: new Date() });

    // Token expiry: forever if rememberMe, 24h otherwise
    const tokenOptions = rememberMe ? {} : { expiresIn: '24h' };
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, phone: user.phone, tagId: user.tagId, isMobile: true },
      getJwtSecret(),
      tokenOptions
    );

    logger.info(`Mobile user logged in: ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        tagId: user.tagId
      }
    });
  } catch (error) {
    logger.error('Mobile login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /api/mobile/auth/verify-identity
 * @desc    Verify phone + email match for password reset
 */
router.post('/auth/verify-identity', async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone || !email) {
      return res.status(400).json({ success: false, message: 'Both phone and email are required' });
    }

    const user = await MobileUser.findOne({ where: { phone, email } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this phone and email combination' });
    }

    // Generate a short-lived token for password reset
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password-reset', isMobile: true },
      getJwtSecret(),
      { expiresIn: '10m' }
    );

    res.json({ success: true, resetToken });
  } catch (error) {
    logger.error('Mobile verify identity error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /api/mobile/auth/reset-password
 * @desc    Reset password with valid reset token
 */
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, getJwtSecret());
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Reset link has expired. Please try again.' });
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(401).json({ success: false, message: 'Invalid reset token' });
    }

    const user = await MobileUser.findByPk(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.update({ password: newPassword });

    logger.info(`Mobile user password reset: ${user.email}`);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Mobile reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   GET /api/mobile/auth/me
 * @desc    Get current mobile user profile
 */
router.get('/auth/me', mobileAuth, async (req, res) => {
  try {
    const user = await MobileUser.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Mobile get me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   PUT /api/mobile/auth/profile
 * @desc    Update user profile
 */
router.put('/auth/profile', mobileAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const user = await MobileUser.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if email already exists for another user
    if (email && email !== user.email) {
      const existing = await MobileUser.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
      }
    }

    // Check if phone already exists for another user
    if (phone && phone !== user.phone) {
      const existing = await MobileUser.findOne({ where: { phone } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Phone number already in use' });
      }
    }

    // Update fields (tagId is immutable — it's the OCPP authorization identifier)
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    await user.save();

    logger.info(`Mobile user ${req.user.id} updated profile`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        tagId: user.tagId,
        active: user.active,
      }
    });
  } catch (error) {
    logger.error('Mobile profile update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/mobile/auth/account
 * @desc    Delete user account and all associated data
 */
router.delete('/auth/account', mobileAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await MobileUser.findByPk(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Start a transaction for safe deletion
    const t = await sequelize.transaction();

    try {
      // Delete payment transactions
      await sequelize.models.PaymentTransaction.destroy({
        where: { userId },
        transaction: t
      });

      // Delete wallet
      await sequelize.models.Wallet.destroy({
        where: { userId },
        transaction: t
      });

      // Delete authorized tag
      if (user.tagId) {
        await sequelize.models.AuthorizedTag.destroy({
          where: { tagId: user.tagId },
          transaction: t
        });
      }

      // Soft delete user (mark as deleted)
      await user.update({
        status: 'deleted',
        active: false,
        deletedAt: new Date(),
        email: `deleted_${user.id}_${user.email}`, // Free up email
        phone: `deleted_${user.id}_${user.phone}`, // Free up phone
      }, { transaction: t });

      await t.commit();

      logger.info(`Mobile user ${userId} deleted their account`);

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (txError) {
      await t.rollback();
      logger.error('Account deletion transaction failed:', txError);
      res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
  } catch (error) {
    logger.error('Mobile delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  STATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/mobile/stations
 * @desc    List all stations — simplified for client use (name, address, simple status)
 */
router.get('/stations', mobileAuth, async (req, res) => {
  try {
    const { search } = req.query;
    logger.debug('Mobile stations list request', { search, userId: req.user.id });
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const stations = await ChargingStation.findAll({
      where,
      attributes: ['id', 'chargePointId', 'name', 'status', 'location', 'connectorCount', 'lastHeartbeat'],
      order: [['name', 'ASC']]
    });

    // Simplified station data for clients
    const stationList = stations.map(s => {
      const station = s.toJSON();
      let isOnline = ocppServer.isConnected(station.chargePointId);
      // Fallback: consider online if heartbeat received within last 3 minutes
      if (!isOnline && station.lastHeartbeat) {
        const timeSinceHeartbeat = Date.now() - new Date(station.lastHeartbeat).getTime();
        if (timeSinceHeartbeat < 3 * 60 * 1000) {
          isOnline = true;
        }
      }

      // Parse location JSON if stored as string
      let address = '';
      if (station.location) {
        try {
          const loc = typeof station.location === 'string' ? JSON.parse(station.location) : station.location;
          address = [loc.address, loc.city, loc.state].filter(Boolean).join(', ');
        } catch {
          address = station.location;
        }
      }

      // Simple status for novice users
      let simpleStatus = 'Offline';
      if (isOnline) {
        if (station.status === 'Available' || station.status === 'Preparing') {
          simpleStatus = 'Ready';
        } else if (station.status === 'Charging' || station.status === 'SuspendedEV' || station.status === 'SuspendedEVSE' || station.status === 'Finishing') {
          simpleStatus = 'In Use';
        } else if (station.status === 'Faulted') {
          simpleStatus = 'Unavailable';
        } else {
          simpleStatus = 'Ready';
        }
      }

      return {
        id: station.id,
        chargePointId: station.chargePointId,
        name: station.name || `Station ${station.chargePointId}`,
        address,
        simpleStatus,
        isOnline,
        connectorCount: station.connectorCount || 1,
      };
    });

    res.json({ success: true, stations: stationList });
  } catch (error) {
    logger.error('Mobile stations list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   GET /api/mobile/locations
 * @desc    Get locations that have stations, with station counts
 */
router.get('/locations', mobileAuth, async (req, res) => {
  try {
    const { search } = req.query;
    logger.debug('Mobile locations request', { search, userId: req.user.id });

    // Query from Locations table with associated stations
    const where = { active: true };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const locations = await Location.findAll({
      where,
      attributes: ['id', 'name', 'state', 'city', 'address', 'latitude', 'longitude', 'pricePerWh', 'minimumCharge'],
      include: [{
        model: ChargingStation,
        as: 'stations',
        attributes: ['chargePointId', 'status'],
      }],
      order: [['name', 'ASC']]
    });

    const result = locations.map(loc => {
      const l = loc.toJSON();
      const stations = l.stations || [];
      let readyStations = 0;
      for (const s of stations) {
        const isOnline = ocppServer.isConnected(s.chargePointId);
        if (isOnline && (s.status === 'Available' || s.status === 'Preparing')) {
          readyStations++;
        }
      }
      return {
        location: l.name,
        address: [l.address, l.city, l.state].filter(Boolean).join(', '),
        city: l.city,
        state: l.state,
        latitude: l.latitude,
        longitude: l.longitude,
        totalStations: stations.length,
        readyStations,
        pricePerWh: l.pricePerWh,
        minimumCharge: l.minimumCharge,
      };
    }).filter(l => l.totalStations > 0);

    res.json({ success: true, locations: result });
  } catch (error) {
    logger.error('Mobile locations error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   GET /api/mobile/stations/:chargePointId
 * @desc    Get station detail by chargePointId (supports QR scan)
 */
router.get('/stations/:chargePointId', mobileAuth, async (req, res) => {
  try {
    const { chargePointId } = req.params;
    logger.info('Mobile QR scan request received', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      chargePointId,
      userId: req.user.id,
      userEmail: req.user.email
    });

    const station = await ChargingStation.findOne({
      where: { chargePointId },
      attributes: ['id', 'chargePointId', 'name', 'vendor', 'model', 'status', 'location', 'description', 'connectorCount', 'lastHeartbeat', 'currentTransaction', 'locationId']
    });

    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    // Block stations without a location assignment
    if (!station.locationId) {
      return res.status(403).json({ 
        success: false, 
        message: 'This station is not authorized for use. Please contact support.',
        notAuthorized: true
      });
    }

    // Get connectors
    const connectors = await Connector.findAll({
      where: { chargePointId },
      attributes: ['connectorId', 'status', 'meterValue', 'lastStatusUpdate']
    });

    const stationData = station.toJSON();
    stationData.isOnline = ocppServer.isConnected(chargePointId);
    // Fallback: consider online if heartbeat received within last 3 minutes
    if (!stationData.isOnline && station.lastHeartbeat) {
      const timeSinceHeartbeat = Date.now() - new Date(station.lastHeartbeat).getTime();
      if (timeSinceHeartbeat < 3 * 60 * 1000) {
        stationData.isOnline = true;
      }
    }
    stationData.connectors = connectors;

    // Parse location for display
    if (stationData.location) {
      try {
        const loc = typeof stationData.location === 'string' ? JSON.parse(stationData.location) : stationData.location;
        stationData.address = [loc.address, loc.city, loc.state].filter(Boolean).join(', ');
        stationData.latitude = loc.latitude;
        stationData.longitude = loc.longitude;
      } catch {
        stationData.address = stationData.location;
      }
    }

    // If lat/long not in station location JSON, try to get from Location table
    if (!stationData.latitude || !stationData.longitude) {
      if (station.locationId) {
        const location = await Location.findByPk(station.locationId);
        if (location) {
          stationData.latitude = location.latitude;
          stationData.longitude = location.longitude;
        }
      }
    }

    // Add pricing and wallet info
    let pricePerWh = 0.4;
    let minimumCharge = 150;
    if (station.locationId) {
      const location = await Location.findByPk(station.locationId);
      if (location) {
        pricePerWh = location.pricePerWh ?? 0.4;
        minimumCharge = location.minimumCharge ?? 150;
      }
    } else {
      // Try to find via separate query since locationId wasn't in attributes
      const stationWithLoc = await ChargingStation.findOne({ where: { chargePointId }, attributes: ['locationId'] });
      if (stationWithLoc && stationWithLoc.locationId) {
        const location = await Location.findByPk(stationWithLoc.locationId);
        if (location) {
          pricePerWh = location.pricePerWh ?? 0.4;
          minimumCharge = location.minimumCharge ?? 150;
        }
      }
    }
    stationData.pricePerWh = pricePerWh;
    stationData.minimumCharge = minimumCharge;
    stationData.pricePerKwh = (pricePerWh * 1000).toFixed(2);

    // Add wallet balance
    const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
    stationData.walletBalance = wallet ? parseFloat(wallet.balance) : 0;
    stationData.canStart = stationData.walletBalance >= minimumCharge;

    // Simple status
    if (stationData.isOnline) {
      if (stationData.status === 'Available' || stationData.status === 'Preparing') {
        stationData.simpleStatus = 'Ready';
      } else if (['Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing'].includes(stationData.status)) {
        stationData.simpleStatus = 'In Use';
      } else if (stationData.status === 'Faulted') {
        stationData.simpleStatus = 'Unavailable';
      } else {
        stationData.simpleStatus = 'Ready';
      }
    } else {
      stationData.simpleStatus = 'Offline';
    }

    res.json({ success: true, station: stationData });
  } catch (error) {
    logger.error('Mobile station detail error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CHARGING SESSION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/mobile/charging/start
 * @desc    Start a charging session via RemoteStartTransaction
 */
router.post('/charging/start', mobileAuth, async (req, res) => {
  try {
    const { chargePointId, connectorId = 1 } = req.body;
    
    logger.info('Mobile charging start request received', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      chargePointId,
      connectorId,
      userId: req.user.id,
      userEmail: req.user.email,
      userTagId: req.user.tagId
    });

    if (!chargePointId) {
      return res.status(400).json({ success: false, message: 'Station ID is required' });
    }

    // Get user's tagId
    const user = await MobileUser.findByPk(req.user.id);
    if (!user || !user.tagId) {
      return res.status(400).json({ success: false, message: 'No authorized tag found for your account' });
    }

    // Check if user account is suspended
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact support.' });
    }

    if (user.status === 'deleted') {
      return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
    }

    // Verify station exists
    const station = await ChargingStation.findOne({ where: { chargePointId } });
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    // Check if station is online
    let isOnline = ocppServer.isConnected(chargePointId);
    // Fallback: consider online if heartbeat received within last 3 minutes
    if (!isOnline && station.lastHeartbeat) {
      const timeSinceHeartbeat = Date.now() - new Date(station.lastHeartbeat).getTime();
      if (timeSinceHeartbeat < 3 * 60 * 1000) {
        isOnline = true;
      }
    }
    if (!isOnline) {
      return res.status(503).json({ success: false, message: 'Station is offline' });
    }

    // Check wallet balance against minimum charge
    const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
    const walletBalance = wallet ? parseFloat(wallet.balance) : 0;

    let minimumCharge = 150;
    const stationForPrice = await ChargingStation.findOne({ where: { chargePointId }, attributes: ['locationId'] });
    if (stationForPrice && stationForPrice.locationId) {
      const location = await Location.findByPk(stationForPrice.locationId);
      if (location && location.minimumCharge) {
        minimumCharge = location.minimumCharge;
      }
    }

    if (walletBalance < minimumCharge) {
      return res.status(402).json({ 
        success: false, 
        message: `Insufficient wallet balance (₦${walletBalance.toFixed(2)}). Minimum required: ₦${minimumCharge.toFixed(0)}`,
        walletBalance,
        minimumCharge
      });
    }

    // Check if station is available
    const connector = await Connector.findOne({
      where: { chargePointId, connectorId: parseInt(connectorId) }
    });

    if (connector && !['Available', 'Preparing'].includes(connector.status)) {
      return res.status(409).json({ success: false, message: `Station is currently ${connector.status}` });
    }

    // Verify actual WebSocket connection exists (heartbeat fallback may show online but WS is gone)
    if (!ocppServer.isConnected(chargePointId)) {
      return res.status(503).json({ 
        success: false, 
        message: 'Station is temporarily unreachable. Please wait a moment and try again.',
        retryable: true
      });
    }

    // Send RemoteStartTransaction
    const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStartTransaction', {
      connectorId: parseInt(connectorId),
      idTag: user.tagId
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Failed to start charging' });
    }

    logger.info(`Mobile user ${user.email} started charging at ${chargePointId} with tag ${user.tagId}`);

    res.json({
      success: true,
      message: 'Charging session started',
      chargePointId,
      idTag: user.tagId
    });
  } catch (error) {
    logger.error('Mobile start charging error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /api/mobile/charging/stop
 * @desc    Stop a charging session via RemoteStopTransaction
 */
router.post('/charging/stop', mobileAuth, async (req, res) => {
  try {
    const { chargePointId } = req.body;
    
    logger.info('Mobile charging stop request received', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      chargePointId,
      userId: req.user.id,
      userEmail: req.user.email,
      userTagId: req.user.tagId
    });

    if (!chargePointId) {
      return res.status(400).json({ success: false, message: 'Station ID is required' });
    }

    const user = await MobileUser.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find the active transaction for this user at this station
    const transaction = await Transaction.findOne({
      where: {
        chargePointId,
        idTag: user.tagId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });

    if (!transaction) {
      // Fallback: find any InProgress transaction at this station
      const fallbackTx = await Transaction.findOne({
        where: { chargePointId, status: 'InProgress' },
        order: [['startTime', 'DESC']]
      });

      if (!fallbackTx) {
        return res.status(404).json({ success: false, message: 'No active charging session found' });
      }
    }

    if (!ocppServer.isConnected(chargePointId)) {
      return res.status(503).json({ success: false, message: 'Station is offline' });
    }

    // Mark user-initiated stop reason
    const activeTx = transaction || await Transaction.findOne({ where: { chargePointId, status: 'InProgress' }, order: [['startTime', 'DESC']] });
    if (activeTx) {
      await activeTx.update({ stopReason: 'Stopped by you' });
    }

    // Get station's actual transactionId from currentTransaction
    const station = await ChargingStation.findOne({ where: { chargePointId } });
    const txId = station && station.currentTransaction
      ? parseInt(station.currentTransaction)
      : (transaction ? transaction.transactionId : 0);

    const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
      transactionId: txId
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Failed to stop charging' });
    }

    logger.info(`Mobile user ${user.email} stopped charging at ${chargePointId}`);

    // Fallback: after 10s, if station still shows Charging, force reset
    setTimeout(async () => {
      try {
        const stationCheck = await ChargingStation.findOne({ where: { chargePointId } });
        if (stationCheck && stationCheck.status === 'Charging') {
          await ChargingStation.update(
            { status: 'Available', currentTransaction: null },
            { where: { chargePointId } }
          );
          // Also reset connector
          const { Connector } = require('../models');
          if (Connector) {
            await Connector.update(
              { status: 'Available', transactionId: null },
              { where: { chargePointId, status: 'Charging' } }
            );
          }
          logger.warn(`Fallback: Force-reset station ${chargePointId} to Available (charger did not send StopTransaction within 10s)`);
        }
      } catch (e) {
        logger.error(`Fallback reset error for ${chargePointId}: ${e.message}`);
      }
    }, 10000);

    res.json({ success: true, message: 'Stop command sent' });
  } catch (error) {
    logger.error('Mobile stop charging error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   POST /api/mobile/charging/autostop
 * @desc    Set auto-stop condition for active charging session
 */
router.post('/charging/autostop', mobileAuth, async (req, res) => {
  try {
    const { chargePointId, autoStopType, autoStopValue } = req.body;
    
    logger.info('Mobile auto-stop set request received', { 
      chargePointId,
      autoStopType,
      autoStopValue,
      userId: req.user.id,
      userEmail: req.user.email
    });

    if (!chargePointId) {
      return res.status(400).json({ success: false, message: 'Station ID is required' });
    }

    if (!autoStopType || !['percentage', 'amount'].includes(autoStopType)) {
      return res.status(400).json({ success: false, message: 'Invalid auto-stop type. Must be percentage or amount' });
    }

    if (autoStopValue === undefined || autoStopValue === null || autoStopValue <= 0) {
      return res.status(400).json({ success: false, message: 'Auto-stop value must be greater than 0' });
    }

    if (autoStopType === 'percentage' && autoStopValue > 100) {
      return res.status(400).json({ success: false, message: 'Percentage cannot exceed 100%' });
    }

    const user = await MobileUser.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find the active transaction for this user at this station
    const transaction = await Transaction.findOne({
      where: {
        chargePointId,
        idTag: user.tagId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'No active charging session found' });
    }

    // Update transaction with auto-stop condition
    await transaction.update({
      autoStopType,
      autoStopValue: parseFloat(autoStopValue)
    });

    logger.info(`Auto-stop condition set for transaction ${transaction.transactionId}: ${autoStopType} at ${autoStopValue}`);

    res.json({
      success: true,
      message: 'Auto-stop condition set successfully',
      autoStopType,
      autoStopValue
    });
  } catch (error) {
    logger.error('Mobile auto-stop error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/mobile/charging/autostop
 * @desc    Clear auto-stop condition for active charging session
 */
router.delete('/charging/autostop', mobileAuth, async (req, res) => {
  try {
    const { chargePointId } = req.body;
    
    logger.info('Mobile auto-stop clear request received', { 
      chargePointId,
      userId: req.user.id,
      userEmail: req.user.email
    });

    if (!chargePointId) {
      return res.status(400).json({ success: false, message: 'Station ID is required' });
    }

    const user = await MobileUser.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find the active transaction for this user at this station
    const transaction = await Transaction.findOne({
      where: {
        chargePointId,
        idTag: user.tagId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'No active charging session found' });
    }

    // Clear auto-stop condition
    await transaction.update({
      autoStopType: null,
      autoStopValue: null
    });

    logger.info(`Auto-stop condition cleared for transaction ${transaction.transactionId}`);

    res.json({
      success: true,
      message: 'Auto-stop condition cleared successfully'
    });
  } catch (error) {
    logger.error('Mobile auto-stop clear error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   GET /api/mobile/charging/status/:chargePointId
 * @desc    Get real-time charging session status
 */
router.get('/charging/status/:chargePointId', mobileAuth, async (req, res) => {
  try {
    const { chargePointId } = req.params;
    const user = await MobileUser.findByPk(req.user.id);

    // Find active transaction
    let transaction = await Transaction.findOne({
      where: { chargePointId, idTag: user.tagId, status: 'InProgress' },
      order: [['startTime', 'DESC']]
    });

    // Fallback
    if (!transaction) {
      transaction = await Transaction.findOne({
        where: { chargePointId, status: 'InProgress' },
        order: [['startTime', 'DESC']]
      });
    }

    if (!transaction) {
      // Return the last completed session for this station/user so app can show summary
      const lastSession = await Transaction.findOne({
        where: { chargePointId, idTag: user.tagId, status: 'Completed' },
        order: [['stopTime', 'DESC']]
      });
      return res.json({ 
        success: true, 
        active: false,
        lastSession: lastSession ? {
          transactionId: lastSession.transactionId,
          energyDelivered: lastSession.energyDelivered || 0,
          amount: lastSession.amount || 0,
          duration: lastSession.stopTime && lastSession.startTime
            ? Math.floor((new Date(lastSession.stopTime) - new Date(lastSession.startTime)) / 1000)
            : 0,
          stopReason: lastSession.stopReason || (lastSession.reason === 'Remote' ? 'Stopped by you' : lastSession.reason === 'Local' ? 'Stopped by charger' : lastSession.reason || 'Session ended'),
          stoppedAt: lastSession.stopTime,
        } : null
      });
    }

    const connector = await Connector.findOne({
      where: { chargePointId, connectorId: transaction.connectorId }
    });

    // Get location pricing
    let pricePerWh = 0.4;
    let minimumCharge = 150;
    const station = await ChargingStation.findOne({ where: { chargePointId }, attributes: ['locationId'] });
    if (station && station.locationId) {
      const location = await Location.findByPk(station.locationId);
      if (location) {
        pricePerWh = location.pricePerWh ?? 0.4;
        minimumCharge = location.minimumCharge ?? 150;
      }
    }

    const duration = Math.floor((Date.now() - new Date(transaction.startTime).getTime()) / 1000);
    const energyWh = transaction.energyDelivered || 0; // Always in Wh

    // Get user's wallet balance
    const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
    const walletBalance = wallet ? parseFloat(wallet.balance) : 0;

    res.json({
      success: true,
      active: true,
      session: {
        transactionId: transaction.transactionId,
        chargePointId: transaction.chargePointId,
        connectorId: transaction.connectorId,
        startTime: transaction.startTime,
        energyDelivered: energyWh,
        energyKwh: (energyWh / 1000),
        amount: transaction.amount || 0,
        duration,
        connectorStatus: connector ? connector.status : 'Unknown',
        soc: connector?.soc || 0,
        pricePerWh,
        minimumCharge,
        walletBalance,
        autoStopType: transaction.autoStopType,
        autoStopValue: transaction.autoStopValue
      }
    });
  } catch (error) {
    logger.error('Mobile charging status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route   GET /api/mobile/transactions
 * @desc    Get user's transaction history
 */
router.get('/transactions', mobileAuth, async (req, res) => {
  try {
    const user = await MobileUser.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const transactions = await Transaction.findAll({
      where: { idTag: user.tagId },
      include: [{
        model: ChargingStation,
        attributes: ['name', 'chargePointId', 'location']
      }],
      order: [['startTime', 'DESC']],
      limit: 50
    });

    res.json({ success: true, transactions });
  } catch (error) {
    logger.error('Mobile transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── App Version Check (no auth required) ──────────────────────────────────
/**
 * @route   GET /api/mobile/app-version
 * @desc    Returns minimum and latest app version for force-update checks
 *          Stored in settings table: category='app', key='version'
 */
router.get('/app-version', async (req, res) => {
  const defaults = {
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    updateUrl: {
      android: 'https://play.google.com/store/apps/details?id=ng.eride.evcharge',
      ios: 'https://apps.apple.com/app/ev-charge/id000000000',
      web: 'https://evcharge.eride.ng',
    },
    message: 'A new version is available with important improvements.',
  };

  try {
    const { Settings } = require('../models');
    let setting = await Settings.findOne({
      where: { category: 'app', key: 'version' }
    });

    // Auto-create with defaults if it doesn't exist yet
    if (!setting) {
      setting = await Settings.create({
        category: 'app',
        key: 'version',
        value: defaults,
        settings: defaults,
      });
    }

    const data = setting.value || setting.settings || defaults;
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('App version check error:', error);
    // Fallback to defaults so the app is never blocked
    res.json({ success: true, ...defaults });
  }
});

/**
 * @route   PUT /api/mobile/app-version
 * @desc    Update app version settings (admin only via CMS auth)
 */
router.put('/app-version', require('../middleware/auth').authenticate, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { minVersion, latestVersion, forceUpdate, updateUrl, message } = req.body;
    const { Settings } = require('../models');

    const data = { minVersion, latestVersion, forceUpdate, updateUrl, message };

    const [setting, created] = await Settings.findOrCreate({
      where: { category: 'app', key: 'version' },
      defaults: { value: data, settings: data },
    });

    if (!created) {
      await setting.update({ value: data, settings: data });
    }

    res.json({ success: true, statusMessage: 'App version settings updated', ...data });
  } catch (error) {
    logger.error('App version update error:', error.message, error.stack);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Register wallet routes
router.use('/wallet', walletRoutes);

module.exports = router;
