const express = require('express');
const { Op } = require('sequelize');
const {
  Location,
  ChargingStation,
  Connector,
  Transaction
} = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const { getPartnerDateRange } = require('../../utils/partnerDateRange');
const logger = require('../../utils/logger');

const router = express.Router();
const ONLINE_STATUSES = new Set(['Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing']);

router.use(authenticate, partnerOnly);

async function getPartnerLocations(partnerId) {
  const locations = await Location.findAll({
    where: { partnerId, active: { [Op.ne]: false } },
    attributes: [
      'id', 'name', 'address', 'city', 'state', 'country',
      'latitude', 'longitude', 'pricePerWh', 'productionCostPerWh',
      'partnerSharePercent'
    ],
    order: [['name', 'ASC']]
  });

  if (!locations.length) return [];

  const locationIds = locations.map(({ id }) => id);
  const stations = await ChargingStation.findAll({
    where: { locationId: { [Op.in]: locationIds } },
    attributes: [
      'id', 'chargePointId', 'name', 'status', 'locationId',
      'connectorCount', 'lastHeartbeat', 'lastConnection', 'errorCode'
    ],
    include: [{
      model: Connector,
      attributes: ['connectorId', 'status', 'soc', 'lastStatusUpdate'],
      required: false
    }],
    order: [['name', 'ASC']]
  });

  const { start: todayStart, end: todayEnd } = getPartnerDateRange({ range: 'daily' });
  const stationIds = stations.map(({ chargePointId }) => chargePointId);
  const todayTransactions = stationIds.length
    ? await Transaction.findAll({
      where: {
        chargePointId: { [Op.in]: stationIds },
        [Op.or]: [
          { partnerId, status: 'Completed', stopTime: { [Op.between]: [todayStart, todayEnd] } },
          { status: 'InProgress', startTime: { [Op.between]: [todayStart, todayEnd] } }
        ]
      },
      attributes: [
        'chargePointId', 'energyDelivered', 'partnerEarning', 'amount', 'status'
      ]
    })
    : [];

  const stationStats = new Map();
  todayTransactions.forEach(transaction => {
    const station = stations.find(item => item.chargePointId === transaction.chargePointId);
    const location = locations.find(item => item.id === station?.locationId);
    const energyWh = Number(transaction.energyDelivered) || 0;
    const activePartnerEarning = transaction.status === 'InProgress'
      ? Math.max(
        (Number(transaction.amount) || energyWh * (Number(location?.pricePerWh) || 0))
          - energyWh * (Number(location?.productionCostPerWh) || 0),
        0
      ) * ((Number(location?.partnerSharePercent) || 0) / 100)
      : Number(transaction.partnerEarning) || 0;
    const current = stationStats.get(transaction.chargePointId) || {
      transactions: 0,
      energyWh: 0,
      partnerEarning: 0
    };
    current.transactions += 1;
    current.energyWh += energyWh;
    current.partnerEarning += activePartnerEarning;
    stationStats.set(transaction.chargePointId, current);
  });

  return locations.map(location => {
    const locationStations = stations
      .filter(station => station.locationId === location.id)
      .map(station => {
        const stats = stationStats.get(station.chargePointId) || {
          transactions: 0,
          energyWh: 0,
          partnerEarning: 0
        };
        return {
          id: station.id,
          chargePointId: station.chargePointId,
          name: station.name,
          status: station.status,
          isOnline: ONLINE_STATUSES.has(station.status),
          connectorCount: station.connectorCount,
          lastHeartbeat: station.lastHeartbeat,
          lastConnection: station.lastConnection,
          errorCode: station.errorCode,
          connectors: station.connectors || [],
          todayTransactions: stats.transactions,
          todayEnergyWh: stats.energyWh,
          todayPartnerEarning: stats.partnerEarning
        };
      });

    const totals = locationStations.reduce((result, station) => ({
      transactions: result.transactions + station.todayTransactions,
      energyWh: result.energyWh + station.todayEnergyWh,
      partnerEarning: result.partnerEarning + station.todayPartnerEarning
    }), { transactions: 0, energyWh: 0, partnerEarning: 0 });

    const onlineStations = locationStations.filter(station => station.isOnline).length;
    return {
      ...location.toJSON(),
      stationCount: locationStations.length,
      onlineStations,
      offlineStations: locationStations.length - onlineStations,
      todayTransactions: totals.transactions,
      todayEnergyWh: totals.energyWh,
      todayPartnerEarning: totals.partnerEarning,
      stations: locationStations
    };
  });
}

router.get('/locations', async (req, res) => {
  try {
    const locations = await getPartnerLocations(req.partnerId);
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      locations
    });
  } catch (error) {
    logger.error('Error fetching partner monitor locations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch monitor locations' });
  }
});

router.get('/stations', async (req, res) => {
  try {
    const locations = await getPartnerLocations(req.partnerId);
    const stations = locations.flatMap(location =>
      location.stations.map(station => ({
        ...station,
        location: {
          id: location.id,
          name: location.name,
          city: location.city,
          state: location.state,
          latitude: location.latitude,
          longitude: location.longitude
        }
      }))
    );

    res.json({ success: true, stations });
  } catch (error) {
    logger.error('Error fetching partner stations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stations' });
  }
});

module.exports = router;
