const express = require('express');
const { Location, ChargingStation } = require('../../models');
const { authenticate, authorize } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/admin/locations
 * @desc    Get all locations with station counts
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const locations = await Location.findAll({
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
 * @route   GET /api/admin/locations/:id
 * @desc    Get single location with its stations
 */
router.get('/:id', authenticate, async (req, res) => {
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
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, country, state, city, address, latitude, longitude, description, pricePerWh, minimumCharge } = req.body;

    logger.info(`Location creation attempt: name=${name}, state=${state}, city=${city}`);

    if (!name || !state || !city) {
      logger.warn('Location creation failed: Missing required fields', { name, state, city });
      return res.status(400).json({ success: false, message: 'Name, state, and city are required' });
    }

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
router.put('/:id', authenticate, async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    const { name, country, state, city, address, latitude, longitude, description, active, pricePerWh, minimumCharge } = req.body;
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
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

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
router.post('/:id/assign-station', authenticate, async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

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
router.post('/:id/unassign-station', authenticate, async (req, res) => {
  try {
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
