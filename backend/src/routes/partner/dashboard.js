const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { PartnerCompany, Location, ChargingStation, Transaction, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const { getPartnerDateRange, lagosDateKey } = require('../../utils/partnerDateRange');
const logger = require('../../utils/logger');

/**
 * @route   GET /api/partner/dashboard/summary
 * @desc    Get partner dashboard summary statistics
 * @access  Private (partner)
 */
router.get('/summary', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    logger.info('Partner dashboard summary - partnerId:', partnerId, 'user:', req.user);
    const { range = 'monthly' } = req.query;

    const allTime = range === 'all';
    const period = allTime ? { range: 'all', start: null, end: new Date() } : getPartnerDateRange({ range });
    const startDate = period.start;

    // Get partner's locations and stations
    const locations = await Location.findAll({
      where: { partnerId },
      attributes: ['id', 'name']
    });

    const locationIds = locations.map(l => l.id);

    const stations = await ChargingStation.findAll({
      where: { locationId: locationIds },
      attributes: ['id', 'chargePointId', 'status']
    });

    const onlineStations = stations.filter(s => s.status === 'Available' || s.status === 'Charging').length;
    const offlineStations = stations.length - onlineStations;

    // Get transaction statistics
    const stats = await sequelize.query(`
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(t."energyDelivered"), 0) as total_energy_wh,
        COALESCE(SUM(
          CASE
            WHEN t.status = 'Completed' THEN t."partnerEarning"
            ELSE GREATEST(
              COALESCE(NULLIF(t.amount, 0), t."energyDelivered" * COALESCE(l."pricePerWh", 0), 0)
              - (t."energyDelivered" * COALESCE(l."productionCostPerWh", 0)),
              0
            ) * (COALESCE(l."partnerSharePercent", 0) / 100.0)
          END
        ), 0) as partner_earning,
        COUNT(*) FILTER (WHERE t.status = 'InProgress') as active_transactions,
        COALESCE(SUM(t."energyDelivered") FILTER (WHERE t.status = 'InProgress'), 0) as active_energy_wh,
        COALESCE(SUM(
          GREATEST(
            COALESCE(NULLIF(t.amount, 0), t."energyDelivered" * COALESCE(l."pricePerWh", 0), 0)
            - (t."energyDelivered" * COALESCE(l."productionCostPerWh", 0)),
            0
          ) * (COALESCE(l."partnerSharePercent", 0) / 100.0)
        ) FILTER (WHERE t.status = 'InProgress'), 0) as active_partner_earning
      FROM transactions t
      LEFT JOIN charging_stations c ON c."chargePointId" = t."chargePointId"
      LEFT JOIN locations l ON l.id = c."locationId"
      WHERE (
        (t.status = 'Completed' AND t."partnerId" = :partnerId)
        OR (t.status = 'InProgress' AND l."partnerId" = :partnerId)
      )
        ${allTime ? '' : 'AND COALESCE(t."stopTime", t."startTime") >= :startDate'}
    `, {
      replacements: { partnerId, startDate },
      type: sequelize.QueryTypes.SELECT
    });

    // Get pending settlement amount
    const pendingSettlement = await sequelize.query(`
      SELECT COALESCE(SUM("partnerEarning"), 0) as pending_amount
      FROM transactions
      WHERE "partnerId" = :partnerId
        AND "settlementStatus" = 'pending'
        AND status = 'Completed'
    `, {
      replacements: { partnerId },
      type: sequelize.QueryTypes.SELECT
    });

    // Get paid settlement amount
    const paidSettlement = await sequelize.query(`
      SELECT COALESCE(SUM("partnerEarning"), 0) as paid_amount
      FROM transactions
      WHERE "partnerId" = :partnerId
        AND "settlementStatus" = 'paid'
        AND status = 'Completed'
    `, {
      replacements: { partnerId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      summary: {
        totalLocations: locations.length,
        totalStations: stations.length,
        onlineStations,
        offlineStations,
        totalTransactions: parseInt(stats[0].total_transactions || 0, 10),
        totalEnergyWh: parseFloat(stats[0].total_energy_wh || 0),
        partnerEarning: parseFloat(stats[0].partner_earning || 0),
        activeTransactions: parseInt(stats[0].active_transactions || 0, 10),
        activeEnergyWh: parseFloat(stats[0].active_energy_wh || 0),
        activePartnerEarning: parseFloat(stats[0].active_partner_earning || 0),
        pendingSettlement: parseFloat(pendingSettlement[0].pending_amount || 0),
        paidSettlement: parseFloat(paidSettlement[0].paid_amount || 0)
      },
      range
    });
  } catch (error) {
    logger.error('Error fetching partner dashboard summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/dashboard/recent-transactions
 * @desc    Get recent transactions for partner
 * @access  Private (partner)
 */
router.get('/recent-transactions', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    const { limit = 10 } = req.query;

    const transactions = await sequelize.query(`
      SELECT
        t."transactionId",
        t."chargePointId",
        t."idTag",
        t."startTime",
        t."stopTime",
        t."energyDelivered",
        t."partnerEarning",
        c.name as station_name
      FROM transactions t
      LEFT JOIN charging_stations c ON t."chargePointId" = c."chargePointId"
      WHERE t."partnerId" = :partnerId
        AND t.status = 'Completed'
      ORDER BY t."stopTime" DESC
      LIMIT :limit
    `, {
      replacements: { partnerId, limit: parseInt(limit) },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    logger.error('Error fetching recent transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent transactions: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/dashboard/performance-by-location
 * @desc    Get performance breakdown by location
 * @access  Private (partner)
 */
router.get('/performance-by-location', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;

    const performance = await sequelize.query(`
      SELECT
        l.id as location_id,
        l.name as location_name,
        l.city,
        l.state,
        COUNT(t.id) as transaction_count,
        COALESCE(SUM(t."energyDelivered"), 0) as total_energy_wh,
        COALESCE(SUM(
          CASE
            WHEN t.status = 'Completed' THEN t."partnerEarning"
            ELSE GREATEST(
              COALESCE(NULLIF(t.amount, 0), t."energyDelivered" * COALESCE(l."pricePerWh", 0), 0)
              - (t."energyDelivered" * COALESCE(l."productionCostPerWh", 0)),
              0
            ) * (COALESCE(l."partnerSharePercent", 0) / 100.0)
          END
        ), 0) as total_partner_earning
      FROM locations l
      LEFT JOIN charging_stations c ON l.id = c."locationId"
      LEFT JOIN transactions t ON c."chargePointId" = t."chargePointId"
        AND (
          (t.status = 'Completed' AND t."partnerId" = :partnerId)
          OR t.status = 'InProgress'
        )
      WHERE l."partnerId" = :partnerId
      GROUP BY l.id, l.name, l.city, l.state
      ORDER BY total_partner_earning DESC
    `, {
      replacements: { partnerId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      performance
    });
  } catch (error) {
    logger.error('Error fetching performance by location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance by location: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/dashboard/revenue-trend
 * @desc    Get daily revenue and energy trend for the last 7 days
 * @access  Private (partner)
 */
router.get('/revenue-trend', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    const { days = 7 } = req.query;
    const dayCount = Math.max(1, Math.min(parseInt(days, 10) || 7, 30));

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - dayCount + 1);
    startDate.setHours(0, 0, 0, 0);

    const trends = await sequelize.query(`
      SELECT
        (COALESCE(t."stopTime", t."startTime") AT TIME ZONE 'Africa/Lagos')::date as date,
        COUNT(*) as transactions,
        COALESCE(SUM(t."energyDelivered"), 0) as energy_wh,
        COALESCE(SUM(
          CASE
            WHEN t.status = 'Completed' THEN t."partnerEarning"
            ELSE GREATEST(
              COALESCE(NULLIF(t.amount, 0), t."energyDelivered" * COALESCE(l."pricePerWh", 0), 0)
              - (t."energyDelivered" * COALESCE(l."productionCostPerWh", 0)),
              0
            ) * (COALESCE(l."partnerSharePercent", 0) / 100.0)
          END
        ), 0) as revenue
      FROM transactions t
      LEFT JOIN charging_stations c ON c."chargePointId" = t."chargePointId"
      LEFT JOIN locations l ON l.id = c."locationId"
      WHERE (
        (t.status = 'Completed' AND t."partnerId" = :partnerId)
        OR (t.status = 'InProgress' AND l."partnerId" = :partnerId)
      )
        AND COALESCE(t."stopTime", t."startTime") >= :startDate
      GROUP BY (COALESCE(t."stopTime", t."startTime") AT TIME ZONE 'Africa/Lagos')::date
      ORDER BY date ASC
    `, {
      replacements: { partnerId, startDate },
      type: sequelize.QueryTypes.SELECT
    });

    // Build a complete date series
    const dateMap = {};
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = lagosDateKey(d);
      dateMap[dateStr] = {
        date: dateStr,
        label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
        transactions: 0,
        energyWh: 0,
        revenue: 0
      };
    }

    trends.forEach(row => {
      const dateStr = String(row.date).slice(0, 10);
      if (dateMap[dateStr]) {
        dateMap[dateStr].transactions = parseInt(row.transactions || 0);
        dateMap[dateStr].energyWh = parseFloat(row.energy_wh || 0);
        dateMap[dateStr].revenue = parseFloat(row.revenue || 0);
      }
    });

    res.json({
      success: true,
      series: Object.values(dateMap)
    });
  } catch (error) {
    logger.error('Error fetching revenue trend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue trend: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/dashboard/notifications
 * @desc    Get partner notifications and alerts
 * @access  Private (partner)
 */
router.get('/notifications', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    const notifications = [];

    // Get offline stations
    const locations = await Location.findAll({
      where: { partnerId },
      attributes: ['id', 'name']
    });
    const locationIds = locations.map(l => l.id);

    const offlineStations = await ChargingStation.findAll({
      where: {
        locationId: locationIds,
        status: {
          [Op.notIn]: ['Available', 'Charging', 'Preparing']
        }
      },
      attributes: ['chargePointId', 'name', 'status', 'locationId'],
      limit: 10
    });

    offlineStations.forEach(station => {
      const location = locations.find(l => l.id === station.locationId);
      notifications.push({
        id: `offline-${station.chargePointId}`,
        type: 'error',
        title: 'Station Offline',
        message: `${station.name} at ${location?.name || 'Unknown'} is ${station.status}`,
        time: new Date().toISOString()
      });
    });

    // Get pending settlement amount
    const pending = await sequelize.query(`
      SELECT COALESCE(SUM("partnerEarning"), 0) as pending_amount,
             COUNT(*) as pending_count
      FROM transactions
      WHERE "partnerId" = :partnerId
        AND "settlementStatus" = 'pending'
        AND status = 'Completed'
    `, {
      replacements: { partnerId },
      type: sequelize.QueryTypes.SELECT
    });

    const pendingAmount = parseFloat(pending[0].pending_amount || 0);
    if (pendingAmount > 0) {
      notifications.push({
        id: 'pending-settlement',
        type: 'warning',
        title: 'Pending Settlement',
        message: `₦${pendingAmount.toLocaleString()} awaiting settlement approval`,
        time: new Date().toISOString()
      });
    }

    // Recent completed transactions
    const recent = await sequelize.query(`
      SELECT t."transactionId",
             t."partnerEarning", t."stopTime"
      FROM transactions t
      WHERE t."partnerId" = :partnerId
        AND t.status = 'Completed'
      ORDER BY t."stopTime" DESC
      LIMIT 1
    `, {
      replacements: { partnerId },
      type: sequelize.QueryTypes.SELECT
    });

    if (recent.length > 0) {
      notifications.push({
        id: 'recent-session',
        type: 'success',
        title: 'Recent Session Completed',
        message: `Your earning: ₦${parseFloat(recent[0].partnerEarning || 0).toLocaleString()}`,
        time: recent[0].stopTime
      });
    }

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications: ' + error.message
    });
  }
});

module.exports = router;
