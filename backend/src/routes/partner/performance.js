const express = require('express');
const { Op } = require('sequelize');
const { Location, ChargingStation, Transaction } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const { getPartnerDateRange, lagosDateKey } = require('../../utils/partnerDateRange');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate, partnerOnly);

function number(value) {
  return Number.parseFloat(value) || 0;
}

async function loadPerformance(partnerId, query) {
  const period = getPartnerDateRange(query);
  const locations = await Location.findAll({
    where: { partnerId },
    attributes: ['id', 'name', 'city', 'state']
  });
  const locationIds = locations.map(location => location.id);

  const stations = locationIds.length
    ? await ChargingStation.findAll({
      where: { locationId: { [Op.in]: locationIds } },
      attributes: ['id', 'chargePointId', 'name', 'locationId']
    })
    : [];

  const requestedLocationId = query.locationId ? Number.parseInt(query.locationId, 10) : null;
  if (requestedLocationId && !locationIds.includes(requestedLocationId)) {
    const error = new Error('Location is not assigned to this partner');
    error.status = 403;
    throw error;
  }

  const requestedStation = query.chargePointId
    ? stations.find(station => station.chargePointId === query.chargePointId)
    : null;
  if (query.chargePointId && !requestedStation) {
    const error = new Error('Station is not assigned to this partner');
    error.status = 403;
    throw error;
  }

  const where = {
    partnerId,
    status: 'Completed',
    stopTime: { [Op.between]: [period.start, period.end] }
  };
  if (requestedLocationId) where.locationId = requestedLocationId;
  if (requestedStation) where.chargePointId = requestedStation.chargePointId;

  const transactions = await Transaction.findAll({
    where,
    attributes: [
      'transactionId', 'chargePointId', 'locationId', 'stopTime',
      'energyDelivered', 'partnerEarning'
    ],
    order: [['stopTime', 'ASC']]
  });

  const locationMap = new Map(locations.map(location => [location.id, location]));
  const stationMap = new Map(stations.map(station => [station.chargePointId, station]));
  const daily = new Map();
  const locationGroups = new Map();
  const stationGroups = new Map();

  const emptyTotals = () => ({
    transactions: 0,
    energyWh: 0,
    partnerEarning: 0
  });
  const totals = emptyTotals();

  const addTransaction = (target, transaction) => {
    target.transactions += 1;
    target.energyWh += number(transaction.energyDelivered);
    target.partnerEarning += number(transaction.partnerEarning);
  };

  transactions.forEach(transaction => {
    addTransaction(totals, transaction);

    const day = lagosDateKey(transaction.stopTime);
    if (!daily.has(day)) daily.set(day, { label: day, ...emptyTotals() });
    addTransaction(daily.get(day), transaction);

    const locationId = transaction.locationId || stationMap.get(transaction.chargePointId)?.locationId || null;
    if (!locationGroups.has(locationId)) {
      const location = locationMap.get(locationId);
      locationGroups.set(locationId, {
        locationId,
        locationName: location?.name || 'Unassigned',
        city: location?.city || '',
        state: location?.state || '',
        ...emptyTotals()
      });
    }
    addTransaction(locationGroups.get(locationId), transaction);

    if (!stationGroups.has(transaction.chargePointId)) {
      const station = stationMap.get(transaction.chargePointId);
      stationGroups.set(transaction.chargePointId, {
        chargePointId: transaction.chargePointId,
        stationName: station?.name || transaction.chargePointId,
        locationId: station?.locationId || locationId,
        ...emptyTotals()
      });
    }
    addTransaction(stationGroups.get(transaction.chargePointId), transaction);
  });

  const byLocation = [...locationGroups.values()].sort((a, b) => b.partnerEarning - a.partnerEarning);
  const byStation = [...stationGroups.values()].sort((a, b) => b.partnerEarning - a.partnerEarning);

  return {
    range: period.range,
    period: { start: period.start, end: period.end },
    filters: {
      locationId: requestedLocationId,
      chargePointId: requestedStation?.chargePointId || null
    },
    totals: {
      ...totals,
      averageEarningPerSession: totals.transactions ? totals.partnerEarning / totals.transactions : 0
    },
    series: [...daily.values()],
    byLocation,
    byStation,
    bestLocation: byLocation[0] || null,
    bestStation: byStation[0] || null,
    filtersAvailable: {
      locations,
      stations
    },
    transactions
  };
}

router.get('/export.csv', async (req, res) => {
  try {
    const performance = await loadPerformance(req.partnerId, req.query);
    const header = [
      'Transaction ID', 'Date', 'Station', 'Location', 'Energy (Wh)',
      'Partner Earning'
    ];
    const rows = performance.transactions.map(transaction => {
      const station = performance.filtersAvailable.stations.find(item => item.chargePointId === transaction.chargePointId);
      const location = performance.filtersAvailable.locations.find(item =>
        item.id === (transaction.locationId || station?.locationId)
      );
      return [
        transaction.transactionId,
        new Date(transaction.stopTime).toISOString(),
        station?.name || transaction.chargePointId,
        location?.name || '',
        number(transaction.energyDelivered),
        number(transaction.partnerEarning).toFixed(2)
      ];
    });

    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(row => row.map(escape).join(',')).join('\n');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="partner-performance-${performance.range}.csv"`
    });
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    logger.error('Error exporting partner performance:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const performance = await loadPerformance(req.partnerId, req.query);
    const { transactions, ...response } = performance;
    res.json({ success: true, ...response });
  } catch (error) {
    logger.error('Error fetching partner performance:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.loadPerformance = loadPerformance;
