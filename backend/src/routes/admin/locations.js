const express = require('express');
const { Op } = require('sequelize');
const { Location, ChargingStation, Transaction, OcppMessage } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { applyLocationStateScope, canAccessState } = require('../../middleware/adminScope');
const { parseLagosDate } = require('../../utils/timezone');
const logger = require('../../utils/logger');

const router = express.Router();
const ONLINE_STATES = new Set(['Available', 'Charging', 'Preparing', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved']);
const ACTIVITY_STATUSES = new Set(['Completed', 'InProgress', 'Stopped']);

function parseDateFilter(value, endOfDay = false) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLagosDate(value, endOfDay);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date filter');
  return parsed;
}

function watDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(value));
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normaliseActivityQuery(query = {}) {
  const from = parseDateFilter(query.from || query.startDate);
  const to = parseDateFilter(query.to || query.endDate, true);
  if (from && to && from > to) throw new Error('The start date must be before the end date');
  const status = String(query.status || 'all');
  if (status !== 'all' && !ACTIVITY_STATUSES.has(status)) throw new Error('Invalid activity status');
  return {
    from,
    to,
    status,
    station: String(query.station || query.chargePointId || '').trim(),
    search: String(query.search || '').trim().slice(0, 120)
  };
}

function buildActivityWhere(locationId, stationIds, filters, stations) {
  const scope = [{ locationId }];
  if (stationIds.length) scope.push({ locationId: null, chargePointId: { [Op.in]: stationIds } });
  const where = { [Op.or]: scope };
  const and = [];

  if (filters.station) {
    if (!stationIds.includes(filters.station)) return { id: -1 };
    and.push({ chargePointId: filters.station });
  }
  if (filters.status !== 'all') and.push({ status: filters.status });
  if (filters.from || filters.to) {
    if (filters.to) and.push({ startTime: { [Op.lte]: filters.to } });
    if (filters.from) and.push({ [Op.or]: [{ stopTime: { [Op.gte]: filters.from } }, { stopTime: null }] });
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const searchParts = [
      { idTag: { [Op.iLike]: pattern } },
      { chargePointId: { [Op.iLike]: pattern } }
    ];
    if (/^\d+$/.test(filters.search)) searchParts.push({ transactionId: Number(filters.search) });
    const matchingStations = stations
      .filter(station => [station.name, station.chargePointId].some(value => String(value || '').toLowerCase().includes(filters.search.toLowerCase())))
      .map(station => station.chargePointId);
    if (matchingStations.length) searchParts.push({ chargePointId: { [Op.in]: matchingStations } });
    and.push({ [Op.or]: searchParts });
  }
  if (and.length) where[Op.and] = and;
  return where;
}

function summariseActivity(rows, stations) {
  const summary = {
    sessions: rows.length,
    completed: 0,
    active: 0,
    stopped: 0,
    energyWh: 0,
    amount: 0,
    grossAmount: 0,
    billed: 0,
    unbilled: 0,
    averageEnergyWh: 0,
    averageAmount: 0
  };
  const daily = new Map();
  const stationSummary = new Map(stations.map(station => [station.chargePointId, {
    chargePointId: station.chargePointId,
    name: station.name,
    status: station.status,
    isOnline: ONLINE_STATES.has(station.status),
    sessions: 0,
    energyWh: 0,
    amount: 0,
    lastHeartbeat: station.lastHeartbeat,
    lastConnection: station.lastConnection,
    errorCode: station.errorCode
  }]));

  rows.forEach(row => {
    const energy = Number(row.energyDelivered) || 0;
    const amount = Number(row.amount) || 0;
    const gross = Number(row.grossAmount) || amount;
    const status = String(row.status || '');
    if (status === 'Completed') summary.completed += 1;
    if (status === 'InProgress') summary.active += 1;
    if (status === 'Stopped') summary.stopped += 1;
    summary.energyWh += energy;
    summary.amount += amount;
    summary.grossAmount += gross;
    if (row.billedAt) summary.billed += 1; else summary.unbilled += 1;

    const station = stationSummary.get(row.chargePointId);
    if (station) {
      station.sessions += 1;
      station.energyWh += energy;
      station.amount += amount;
    }

    const key = watDate(row.stopTime || row.startTime);
    if (key) {
      const day = daily.get(key) || { date: key, sessions: 0, energyWh: 0, amount: 0 };
      day.sessions += 1;
      day.energyWh += energy;
      day.amount += amount;
      daily.set(key, day);
    }
  });
  summary.averageEnergyWh = summary.sessions ? summary.energyWh / summary.sessions : 0;
  summary.averageAmount = summary.sessions ? summary.amount / summary.sessions : 0;
  return {
    summary,
    daily: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)),
    stationSummary: [...stationSummary.values()].sort((left, right) => left.name.localeCompare(right.name))
  };
}

async function loadLocationActivity(locationId, req, exportAll = false) {
  const location = await Location.findByPk(locationId, {
    attributes: ['id', 'name', 'country', 'state', 'city', 'address', 'description', 'latitude', 'longitude', 'pricePerWh', 'minimumCharge', 'partnerId', 'active', 'createdAt', 'updatedAt']
  });
  if (!location) return null;
  if (!canAccessState(req.user, location.state)) {
    const error = new Error('This location is outside your assigned state scope');
    error.statusCode = 403;
    throw error;
  }

  const filters = normaliseActivityQuery(req.query);
  const stations = await ChargingStation.findAll({
    where: { locationId: location.id },
    attributes: ['id', 'chargePointId', 'name', 'status', 'connectorCount', 'lastHeartbeat', 'lastConnection', 'errorCode', 'currentMeterValue', 'currentTransaction', 'firmwareVersion'],
    order: [['name', 'ASC']]
  });
  const stationIds = stations.map(station => station.chargePointId).filter(Boolean);
  const where = buildActivityWhere(location.id, stationIds, filters, stations);
  const summaryRows = await Transaction.findAll({
    where,
    attributes: ['id', 'transactionId', 'chargePointId', 'connectorId', 'idTag', 'startTime', 'stopTime', 'startMeterValue', 'stopMeterValue', 'energyDelivered', 'amount', 'grossAmount', 'status', 'billedAt', 'reason', 'stopReason', 'startBatteryPercentage', 'endBatteryPercentage'],
    order: [['startTime', 'DESC']]
  });
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const rows = exportAll ? summaryRows : summaryRows.slice(offset, offset + limit);
  const stationMap = new Map(stations.map(station => [station.chargePointId, station.toJSON()]));
  const transactions = rows.map(row => ({ ...row.toJSON(), station: stationMap.get(row.chargePointId) || null }));
  const summaryData = summariseActivity(summaryRows, stations);

  const eventWhere = stationIds.length ? { chargePointId: { [Op.in]: stationIds } } : { chargePointId: '__NO_LOCATION_STATION__' };
  if (filters.from || filters.to) {
    eventWhere.timestamp = {};
    if (filters.from) eventWhere.timestamp[Op.gte] = filters.from;
    if (filters.to) eventWhere.timestamp[Op.lte] = filters.to;
  }
  const eventPage = Math.max(Number.parseInt(req.query.eventPage, 10) || 1, 1);
  const eventLimit = Math.min(Math.max(Number.parseInt(req.query.eventLimit, 10) || 20, 1), 100);
  const eventOffset = (eventPage - 1) * eventLimit;
  const { rows: eventRows, count: eventTotal } = await OcppMessage.findAndCountAll({
    where: eventWhere,
    attributes: ['id', 'chargePointId', 'message_type', 'status', 'direction', 'timestamp', 'createdAt', 'errorCode', 'errorDescription'],
    order: [['timestamp', 'DESC'], ['createdAt', 'DESC']],
    limit: eventLimit,
    offset: eventOffset
  });

  return {
    location: location.toJSON(),
    filters: {
      from: req.query.from || req.query.startDate || '',
      to: req.query.to || req.query.endDate || '',
      station: filters.station,
      status: filters.status,
      search: filters.search
    },
    stations: stations.map(station => station.toJSON()),
    stationSummary: summaryData.stationSummary,
    summary: summaryData.summary,
    daily: summaryData.daily,
    events: eventRows.map(event => event.toJSON()),
    transactions,
    pagination: { page, limit, total: summaryRows.length, pages: Math.ceil(summaryRows.length / limit) },
    eventPagination: { page: eventPage, limit: eventLimit, total: eventTotal, pages: Math.ceil(eventTotal / eventLimit) }
  };
}

function activityCsv(report) {
  const rows = [
    ['LOCATION ACTIVITY REPORT', report.location.name],
    ['Address', [report.location.address, report.location.city, report.location.state].filter(Boolean).join(', ')],
    ['Date from', report.filters.from || 'All time'],
    ['Date to', report.filters.to || 'All time'],
    [],
    ['SUMMARY', 'VALUE'],
    ['Sessions', report.summary.sessions],
    ['Completed', report.summary.completed],
    ['Active', report.summary.active],
    ['Stopped', report.summary.stopped],
    ['Energy (Wh)', report.summary.energyWh],
    ['Gross amount (NGN)', report.summary.grossAmount],
    ['Billed amount (NGN)', report.summary.amount],
    ['Billed sessions', report.summary.billed],
    ['Unbilled sessions', report.summary.unbilled],
    [],
    ['TRANSACTIONS'],
    ['Transaction', 'Station', 'Connector', 'Tag', 'Status', 'Start time', 'Stop time', 'Energy Wh', 'Amount NGN', 'Gross NGN', 'Billed at', 'Reason']
  ];
  const allRows = report.transactions;
  allRows.forEach(row => rows.push([
    row.transactionId, row.station?.name || row.chargePointId, row.connectorId, row.idTag, row.status,
    row.startTime, row.stopTime || '', row.energyDelivered, row.amount, row.grossAmount || row.amount,
    row.billedAt || '', row.stopReason || row.reason || ''
  ]));
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

/**
 * @route   GET /api/admin/locations
 * @desc    Get all locations with station counts
 */
router.get('/', authenticate, requirePermission('locations.view'), async (req, res) => {
  try {
    const locations = await Location.findAll({
      where: applyLocationStateScope(req.user),
      order: [['name', 'ASC']],
      include: [{
        model: ChargingStation,
        as: 'stations',
        attributes: ['id', 'chargePointId', 'name', 'status']
      }]
    });

    const result = locations.map(loc => {
      const l = loc.toJSON();
      return {
        ...l,
        stationCount: l.stations ? l.stations.length : 0,
        stations: l.stations || []
      };
    });

    res.json({ success: true, locations: result });
  } catch (error) {
    logger.error('Error fetching locations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch locations' });
  }
});

/**
 * @route   GET /api/admin/locations/:id/activity
 * @desc    Location-wide activity, station health and filtered transaction history
 */
router.get('/:id/activity', authenticate, requirePermission('locations.view'), async (req, res) => {
  try {
    const report = await loadLocationActivity(req.params.id, req);
    if (!report) return res.status(404).json({ success: false, message: 'Location not found' });
    res.json({ success: true, generatedAt: new Date().toISOString(), report });
  } catch (error) {
    logger.error('Error fetching location activity:', error);
    res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Failed to fetch location activity' });
  }
});

/**
 * @route   GET /api/admin/locations/:id/activity.csv
 * @desc    Export the filtered location activity report for Excel-compatible tools
 */
router.get('/:id/activity.csv', authenticate, requirePermission('locations.view'), async (req, res) => {
  try {
    const report = await loadLocationActivity(req.params.id, req, true);
    if (!report) return res.status(404).json({ success: false, message: 'Location not found' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="location-${req.params.id}-activity.csv"`);
    res.send(`\uFEFF${activityCsv(report)}`);
  } catch (error) {
    logger.error('Error exporting location activity:', error);
    res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Failed to export location activity' });
  }
});

/**
 * @route   GET /api/admin/locations/:id
 * @desc    Get single location with its stations
 */
router.get('/:id', authenticate, requirePermission('locations.view'), async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id, {
      include: [{
        model: ChargingStation,
        as: 'stations',
        attributes: ['id', 'chargePointId', 'name', 'status', 'connectorCount']
      }]
    });
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    if (!canAccessState(req.user, location.state)) return res.status(403).json({ success: false, message: 'This location is outside your assigned state scope' });
    res.json({ success: true, location });
  } catch (error) {
    logger.error('Error fetching location:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch location' });
  }
});

/**
 * @route   POST /api/admin/locations
 * @desc    Create a new location
 */
router.post('/', authenticate, requirePermission('locations.create'), async (req, res) => {
  try {
    const { name, country, state, city, address, latitude, longitude, description, pricePerWh, minimumCharge } = req.body;

    logger.info(`Location creation attempt: name=${name}, state=${state}, city=${city}`);

    if (!name || !state || !city) {
      logger.warn('Location creation failed: Missing required fields', { name, state, city });
      return res.status(400).json({ success: false, message: 'Name, state, and city are required' });
    }
    if (!canAccessState(req.user, state)) return res.status(403).json({ success: false, message: 'You cannot create a location outside your assigned states' });

    const location = await Location.create({
      name, country: country || 'Nigeria', state, city, address, latitude, longitude,
      description, pricePerWh: pricePerWh || 0.4, minimumCharge: minimumCharge || 150
    });
    logger.info(`Location created successfully: ${name} (${city}, ${state}) - ID: ${location.id}`);
    res.status(201).json({ success: true, location });
  } catch (error) {
    logger.error('Error creating location:', error);
    logger.error('Location creation error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    res.status(500).json({ success: false, message: 'Failed to create location', error: error.message });
  }
});

/**
 * @route   PUT /api/admin/locations/:id
 * @desc    Update a location
 */
router.put('/:id', authenticate, requirePermission('locations.update'), async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    const { name, country, state, city, address, latitude, longitude, description, active, pricePerWh, minimumCharge } = req.body;
    if (!canAccessState(req.user, location.state) || !canAccessState(req.user, state || location.state)) return res.status(403).json({ success: false, message: 'This location is outside your assigned state scope' });
    await location.update({ name, country, state, city, address, latitude, longitude, description, active, pricePerWh, minimumCharge });

    // Also update the location JSON string on all linked stations
    const locationJson = JSON.stringify({
      state: location.state,
      city: location.city,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude
    });
    await ChargingStation.update(
      { location: locationJson },
      { where: { locationId: location.id } }
    );

    logger.info(`Location updated: ${location.name}`);
    res.json({ success: true, location });
  } catch (error) {
    logger.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
});

/**
 * @route   DELETE /api/admin/locations/:id
 * @desc    Delete a location (unlinks stations)
 */
router.delete('/:id', authenticate, requirePermission('locations.update'), async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    if (!canAccessState(req.user, location.state)) return res.status(403).json({ success: false, message: 'This location is outside your assigned state scope' });

    // Unlink stations
    await ChargingStation.update(
      { locationId: null, location: null },
      { where: { locationId: location.id } }
    );

    await location.destroy();
    logger.info(`Location deleted: ${location.name}`);
    res.json({ success: true, message: 'Location deleted' });
  } catch (error) {
    logger.error('Error deleting location:', error);
    res.status(500).json({ success: false, message: 'Failed to delete location' });
  }
});

/**
 * @route   POST /api/admin/locations/:id/assign-station
 * @desc    Assign a station to this location
 */
router.post('/:id/assign-station', authenticate, requirePermission('locations.update'), async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    if (!canAccessState(req.user, location.state)) return res.status(403).json({ success: false, message: 'This location is outside your assigned state scope' });

    const { stationId } = req.body;
    const station = await ChargingStation.findByPk(stationId);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    const locationJson = JSON.stringify({ state: location.state, city: location.city, address: location.address });
    await station.update({ locationId: location.id, location: locationJson });

    logger.info(`Station ${station.chargePointId} assigned to location ${location.name}`);
    res.json({ success: true, message: 'Station assigned to location' });
  } catch (error) {
    logger.error('Error assigning station:', error);
    res.status(500).json({ success: false, message: 'Failed to assign station' });
  }
});

/**
 * @route   POST /api/admin/locations/:id/unassign-station
 * @desc    Remove a station from this location
 */
router.post('/:id/unassign-station', authenticate, requirePermission('locations.update'), async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    if (!canAccessState(req.user, location.state)) return res.status(403).json({ success: false, message: 'This location is outside your assigned state scope' });
    const { stationId } = req.body;
    const station = await ChargingStation.findByPk(stationId);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    await station.update({ locationId: null, location: null });

    logger.info(`Station ${station.chargePointId} unassigned from location`);
    res.json({ success: true, message: 'Station unassigned from location' });
  } catch (error) {
    logger.error('Error unassigning station:', error);
    res.status(500).json({ success: false, message: 'Failed to unassign station' });
  }
});

module.exports = router;
