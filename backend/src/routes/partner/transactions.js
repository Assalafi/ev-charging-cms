const express = require('express');
const { Op } = require('sequelize');
const { Transaction, ChargingStation, Location } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const { getPartnerDateRange } = require('../../utils/partnerDateRange');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate, partnerOnly);

const partnerTransactionAttributes = [
  'id', 'transactionId', 'chargePointId', 'connectorId', 'startTime', 'stopTime',
  'energyDelivered', 'status', 'reason', 'stopReason', 'partnerEarning',
  'locationId', 'settlementStatus'
];

async function buildFilters(partnerId, query) {
  const where = { partnerId };
  if (query.status && ['InProgress', 'Completed', 'Stopped'].includes(query.status)) {
    where.status = query.status;
  }
  if (query.chargePointId) where.chargePointId = query.chargePointId;
  if (query.locationId) where.locationId = Number.parseInt(query.locationId, 10);
  if (query.range || query.startDate || query.endDate) {
    const period = getPartnerDateRange(query);
    where.stopTime = { [Op.between]: [period.start, period.end] };
  }
  return where;
}

async function enrichTransactions(transactions) {
  const chargePointIds = [...new Set(transactions.map(item => item.chargePointId))];
  const locationIds = [...new Set(transactions.map(item => item.locationId).filter(Boolean))];
  const [stations, locations] = await Promise.all([
    chargePointIds.length
      ? ChargingStation.findAll({
        where: { chargePointId: { [Op.in]: chargePointIds } },
        attributes: ['chargePointId', 'name', 'locationId']
      })
      : [],
    locationIds.length
      ? Location.findAll({
        where: { id: { [Op.in]: locationIds } },
        attributes: ['id', 'name', 'city', 'state']
      })
      : []
  ]);
  const stationMap = new Map(stations.map(station => [station.chargePointId, station]));
  const locationMap = new Map(locations.map(location => [location.id, location]));

  return transactions.map(transaction => {
    const station = stationMap.get(transaction.chargePointId);
    const location = locationMap.get(transaction.locationId || station?.locationId);
    return {
      ...transaction.toJSON(),
      station: station ? { chargePointId: station.chargePointId, name: station.name } : null,
      location: location ? location.toJSON() : null
    };
  });
}

router.get('/export.csv', async (req, res) => {
  try {
    const where = await buildFilters(req.partnerId, req.query);
    const transactions = await Transaction.findAll({
      where,
      attributes: partnerTransactionAttributes,
      order: [['startTime', 'DESC']],
      limit: 10000
    });
    const enriched = await enrichTransactions(transactions);
    const header = [
      'Transaction ID', 'Station', 'Location', 'Start', 'Stop', 'Status',
      'Energy (Wh)', 'Partner Earning', 'Settlement Status'
    ];
    const rows = enriched.map(item => [
      item.transactionId,
      item.station?.name || item.chargePointId,
      item.location?.name || '',
      item.startTime ? new Date(item.startTime).toISOString() : '',
      item.stopTime ? new Date(item.stopTime).toISOString() : '',
      item.status,
      item.energyDelivered || 0,
      item.partnerEarning || 0,
      item.settlementStatus || ''
    ]);
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(row => row.map(escape).join(',')).join('\n');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="partner-transactions.csv"'
    });
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    logger.error('Error exporting partner transactions:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const where = await buildFilters(req.partnerId, req.query);
    const { count, rows } = await Transaction.findAndCountAll({
      where,
      attributes: partnerTransactionAttributes,
      order: [['startTime', 'DESC']],
      offset: (page - 1) * limit,
      limit
    });
    const transactions = await enrichTransactions(rows);
    res.json({
      success: true,
      transactions,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Error fetching partner transactions:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
