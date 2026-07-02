const express = require('express');
const router = express.Router();
const { Location, ChargingStation, Transaction, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const logger = require('../../utils/logger');

/**
 * @route   GET /api/partner/monitor/locations
 * @desc    Get partner locations with station status and today's performance
 * @access  Private (partner)
 */
router.get('/locations', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;

    // Get partner's locations
    const locations = await Location.findAll({
      where: { partnerId },
      attributes: ['id', 'name', 'address', 'city', 'state', 'latitude', 'longitude']
    });

    const locationIds = locations.map(l => l.id);

    // Get today's start time (Africa/Lagos)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get stations for these locations
    const stations = await ChargingStation.findAll({
      where: { locationId: locationIds },
      attributes: ['id', 'chargePointId', 'name', 'status', 'locationId']
    });

    // Get today's transaction data per location
    const locationIdsStr = locationIds.join(',');
    const todayStats = await sequelize.query(`
      SELECT
        c."locationId",
        COUNT(t.id) as today_transactions,
        COALESCE(SUM(t."energyDelivered"), 0) as today_energy_wh,
        COALESCE(SUM(t."partnerEarning"), 0) as today_partner_earning
      FROM charging_stations c
      LEFT JOIN transactions t ON c."chargePointId" = t."chargePointId"
        AND t.status = 'Completed'
        AND t."stopTime" >= :today
      WHERE c."locationId" IN (:locationIds)
      GROUP BY c."locationId"
    `, {
      replacements: { today, locationIds: locationIdsStr },
      type: sequelize.QueryTypes.SELECT
    });

    // Create a map for quick lookup
    const statsMap = {};
    todayStats.forEach(stat => {
      statsMap[stat.locationId] = stat;
    });

    // Build response with location details
    const locationsWithDetails = locations.map(location => {
      const locationStations = stations.filter(s => s.locationId === location.id);
      const onlineCount = locationStations.filter(s => 
        s.status === 'Available' || s.status === 'Charging'
      ).length;
      const offlineCount = locationStations.length - onlineCount;
      const stats = statsMap[location.id] || {
        today_transactions: 0,
        today_energy_wh: 0,
        today_partner_earning: 0
      };

      return {
        ...location.toJSON(),
        stationCount: locationStations.length,
        onlineStations: onlineCount,
        offlineStations: offlineCount,
        todayTransactions: parseInt(stats.today_transactions),
        todayEnergyWh: parseFloat(stats.today_energy_wh),
        todayPartnerEarning: parseFloat(stats.today_partner_earning),
        stations: locationStations.map(s => ({
          chargePointId: s.chargePointId,
          name: s.name,
          status: s.status,
          isOnline: s.status === 'Available' || s.status === 'Charging'
        }))
      };
    });

    res.json({
      success: true,
      locations: locationsWithDetails
    });
  } catch (error) {
    logger.error('Error fetching partner monitor locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monitor locations: ' + error.message
    });
  }
});

/**
 * @route   GET /api/partner/monitor/stations
 * @desc    Get all partner stations with status
 * @access  Private (partner)
 */
router.get('/stations', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;

    // Get partner's locations
    const locations = await Location.findAll({
      where: { partnerId },
      attributes: ['id']
    });

    const locationIds = locations.map(l => l.id);

    // Get stations
    const stations = await ChargingStation.findAll({
      where: { locationId: locationIds },
      include: [{
        model: Location,
        as: 'location',
        attributes: ['id', 'name', 'city', 'state']
      }],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      stations
    });
  } catch (error) {
    logger.error('Error fetching partner stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations: ' + error.message
    });
  }
});

module.exports = router;
