const express = require('express');
const router = express.Router();
const {
  PartnerCompany,
  PartnerSettlement,
  User,
  Location,
  ChargingStation,
  Transaction,
  sequelize
} = require('../../models');
const { Op } = require('sequelize');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const logger = require('../../utils/logger');
const { generateSettlement } = require('../../services/partnerSettlementService');
const { loadPerformance } = require('../partner/performance');
const { parseDateOnly } = require('../../utils/partnerDateRange');

router.get(
  '/:partnerId/performance',
  authenticate,
  requirePermission('partners.view'),
  async (req, res) => {
    try {
      const performance = await loadPerformance(
        Number.parseInt(req.params.partnerId, 10),
        req.query
      );
      const { transactions, ...response } = performance;
      return res.json({ success: true, ...response });
    } catch (error) {
      logger.error('Error fetching admin partner performance:', error);
      return res.status(error.status || 400).json({ success: false, message: error.message });
    }
  }
);

router.post(
  '/:partnerId/settlements/generate',
  authenticate,
  requirePermission('settlements.generate'),
  async (req, res) => {
    try {
      const { periodType, periodStart, periodEnd } = req.body;
      if (!periodType || !periodStart || !periodEnd) {
        return res.status(400).json({
          success: false,
          message: 'periodType, periodStart and periodEnd are required'
        });
      }
      const result = await generateSettlement({
        partnerId: Number.parseInt(req.params.partnerId, 10),
        periodType,
        periodStart: parseDateOnly(periodStart),
        periodEnd: parseDateOnly(periodEnd, true)
      });
      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      logger.error('Error generating partner settlement:', error);
      const isInputError = /date|period|required/i.test(error.message || '');
      return res.status(isInputError ? 400 : 500).json({
        success: false,
        message: isInputError ? error.message : 'Failed to generate settlement'
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// PARTNER COMPANY CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/admin/partners
 * @desc    Get all partner companies with pagination and filters
 * @access  Private (admin)
 */
router.get('/', authenticate, requirePermission('partners.view'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      state,
      settlementFrequency
    } = req.query;
    const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClause = {};
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    if (state) {
      whereClause.state = state;
    }
    if (settlementFrequency && settlementFrequency !== 'all') {
      whereClause.settlementFrequency = settlementFrequency;
    }
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { businessName: { [Op.iLike]: `%${search}%` } },
        { contactEmail: { [Op.iLike]: `%${search}%` } },
        { contactPhone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: partners } = await PartnerCompany.findAndCountAll({
      where: whereClause,
      distinct: true,
      limit: parsedLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Location,
          as: 'locations',
          attributes: ['id'],
          required: false
        },
        {
          model: User,
          as: 'users',
          attributes: ['id'],
          required: false
        }
      ]
    });

    // Add computed fields
    const partnersWithStats = partners.map(partner => ({
      ...partner.toJSON(),
      locationCount: partner.locations ? partner.locations.length : 0,
      userCount: partner.users ? partner.users.length : 0
    }));

    const [
      totalPartners,
      activePartners,
      totalLocations,
      pendingSettlementAmount
    ] = await Promise.all([
      PartnerCompany.count(),
      PartnerCompany.count({ where: { status: 'active' } }),
      Location.count({ where: { partnerId: { [Op.ne]: null } } }),
      PartnerSettlement.sum('finalPayableAmount', {
        where: { status: { [Op.in]: ['draft', 'approved'] } }
      })
    ]);

    res.json({
      success: true,
      partners: partnersWithStats,
      summary: {
        totalPartners,
        activePartners,
        totalLocations,
        pendingSettlementAmount: Number(pendingSettlementAmount || 0)
      },
      pagination: {
        total: count,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(count / parsedLimit)
      }
    });
  } catch (error) {
    logger.error('Error fetching partners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partners: ' + error.message
    });
  }
});

/**
 * @route   GET /api/admin/partners/:id
 * @desc    Get partner company by ID with detailed information
 * @access  Private (admin)
 */
router.get('/:id', authenticate, requirePermission('partners.view'), async (req, res) => {
  try {
    const { id } = req.params;

    const partner = await PartnerCompany.findByPk(id, {
      include: [
        {
          model: Location,
          as: 'locations',
          include: [{
            model: ChargingStation,
            as: 'stations',
            attributes: ['id', 'chargePointId', 'name', 'status']
          }]
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'username', 'email', 'role', 'active', 'lastLogin', 'createdAt']
        },
        {
          model: PartnerSettlement,
          as: 'settlements',
          attributes: [
            'id', 'periodType', 'periodStart', 'periodEnd', 'totalTransactions',
            'grossAmount', 'productionCostAmount', 'partnerEarning',
            'adjustmentAmount', 'finalPayableAmount', 'status', 'createdAt'
          ],
          separate: true,
          limit: 10,
          order: [['periodEnd', 'DESC']]
        }
      ]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Calculate statistics
    const stats = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM("energyDelivered"), 0) as total_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount)), 0) as gross_amount,
        COALESCE(SUM("partnerEarning"), 0) as total_partner_earning,
        COALESCE(SUM("companyEarning"), 0) as total_company_earning
      FROM transactions
      WHERE "partnerId" = :id AND status = 'Completed'
    `, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    const pendingSettlement = await sequelize.query(`
      SELECT COALESCE(SUM("partnerEarning"), 0) as pending_amount
      FROM transactions
      WHERE "partnerId" = :id AND "settlementStatus" = 'pending' AND status = 'Completed'
    `, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    const paidSettlement = await sequelize.query(`
      SELECT COALESCE(SUM("partnerEarning"), 0) as paid_amount
      FROM transactions
      WHERE "partnerId" = :id AND "settlementStatus" = 'paid' AND status = 'Completed'
    `, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      partner: {
        ...partner.toJSON(),
        stats: stats[0],
        pendingSettlement: pendingSettlement[0].pending_amount || 0,
        paidSettlement: paidSettlement[0].paid_amount || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partner: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/partners
 * @desc    Create a new partner company
 * @access  Private (admin)
 */
router.post('/', authenticate, requirePermission('partners.create'), async (req, res) => {
  try {
    const {
      name,
      businessName,
      registrationNumber,
      contactPersonName,
      contactEmail,
      contactPhone,
      address,
      state,
      city,
      logoUrl,
      defaultPartnerSharePercent,
      defaultProductionCostPerWh,
      settlementFrequency,
      bankName,
      bankAccountName,
      bankAccountNumber,
      notes
    } = req.body;

    // Validation
    if (!name || !contactPersonName || !contactEmail || !contactPhone || !settlementFrequency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, contactPersonName, contactEmail, contactPhone, settlementFrequency'
      });
    }

    if (defaultPartnerSharePercent < 0 || defaultPartnerSharePercent > 100) {
      return res.status(400).json({
        success: false,
        message: 'Partner share percent must be between 0 and 100'
      });
    }

    if (defaultProductionCostPerWh < 0) {
      return res.status(400).json({
        success: false,
        message: 'Production cost per Wh cannot be negative'
      });
    }

    const partner = await PartnerCompany.create({
      name,
      businessName,
      registrationNumber,
      contactPersonName,
      contactEmail,
      contactPhone,
      address,
      state,
      city,
      logoUrl,
      defaultPartnerSharePercent: defaultPartnerSharePercent ?? 50,
      defaultProductionCostPerWh: defaultProductionCostPerWh ?? 0,
      settlementFrequency,
      bankName,
      bankAccountName,
      bankAccountNumber,
      notes,
      status: 'active',
      createdBy: req.user.id
    });

    logger.info(`Partner company created: ${partner.id} (${partner.name}) by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Partner company created successfully',
      partner
    });
  } catch (error) {
    logger.error('Error creating partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create partner: ' + error.message
    });
  }
});

/**
 * @route   PUT /api/admin/partners/:id
 * @desc    Update a partner company
 * @access  Private (admin)
 */
router.put('/:id', authenticate, requirePermission('partners.update'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      businessName,
      registrationNumber,
      contactPersonName,
      contactEmail,
      contactPhone,
      address,
      state,
      city,
      logoUrl,
      status,
      defaultPartnerSharePercent,
      defaultProductionCostPerWh,
      settlementFrequency,
      bankName,
      bankAccountName,
      bankAccountNumber,
      notes
    } = req.body;

    const partner = await PartnerCompany.findByPk(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Validation
    if (defaultPartnerSharePercent !== undefined) {
      if (defaultPartnerSharePercent < 0 || defaultPartnerSharePercent > 100) {
        return res.status(400).json({
          success: false,
          message: 'Partner share percent must be between 0 and 100'
        });
      }
    }

    if (defaultProductionCostPerWh !== undefined && defaultProductionCostPerWh < 0) {
      return res.status(400).json({
        success: false,
        message: 'Production cost per Wh cannot be negative'
      });
    }

    await partner.update({
      name,
      businessName,
      registrationNumber,
      contactPersonName,
      contactEmail,
      contactPhone,
      address,
      state,
      city,
      logoUrl,
      status,
      defaultPartnerSharePercent,
      defaultProductionCostPerWh,
      settlementFrequency,
      bankName,
      bankAccountName,
      bankAccountNumber,
      notes
    });

    logger.info(`Partner company updated: ${partner.id} (${partner.name}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Partner company updated successfully',
      partner
    });
  } catch (error) {
    logger.error('Error updating partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update partner: ' + error.message
    });
  }
});

/**
 * @route   DELETE /api/admin/partners/:id
 * @desc    Delete a partner company
 * @access  Private (admin)
 */
router.delete('/:id', authenticate, requirePermission('partners.delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const partner = await PartnerCompany.findByPk(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check if partner has any active locations
    const locationCount = await Location.count({
      where: { partnerId: id }
    });

    if (locationCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete partner with ${locationCount} assigned locations. Unassign locations first.`
      });
    }

    // Check if partner has any pending settlements
    const pendingSettlements = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM transactions
      WHERE "partnerId" = $1 AND "settlementStatus" = 'pending' AND status = 'Completed'
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    if (pendingSettlements[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete partner with pending settlements. Generate settlements first.'
      });
    }

    await partner.destroy();

    logger.info(`Partner company deleted: ${id} (${partner.name}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Partner company deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete partner: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/partners/:id/suspend
 * @desc    Suspend or activate a partner company
 * @access  Private (admin)
 */
router.post('/:id/suspend', authenticate, requirePermission('partners.suspend'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'suspended'

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, suspended, or inactive.'
      });
    }

    const partner = await PartnerCompany.findByPk(id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    await partner.update({ status });

    logger.info(`Partner company status changed: ${id} to ${status} by user ${req.user.id}`);

    res.json({
      success: true,
      message: `Partner ${status} successfully`,
      partner
    });
  } catch (error) {
    logger.error('Error updating partner status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update partner status: ' + error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// PARTNER USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/admin/partners/:partnerId/users
 * @desc    Get all users for a partner
 * @access  Private (admin)
 */
router.get('/:partnerId/users', authenticate, requirePermission('partners.manage_users'), async (req, res) => {
  try {
    const { partnerId } = req.params;

    const partner = await PartnerCompany.findByPk(partnerId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const users = await User.findAll({
      where: { partnerId },
      attributes: ['id', 'username', 'email', 'role', 'active', 'lastLogin', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error('Error fetching partner users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partner users: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/partners/:partnerId/users
 * @desc    Create a user for a partner
 * @access  Private (admin)
 */
router.post('/:partnerId/users', authenticate, requirePermission('partners.manage_users'), async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { username, email, password, role, active = true } = req.body;

    // Validate partner exists
    const partner = await PartnerCompany.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Validate role is a partner role
    const validPartnerRoles = ['partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'];
    if (!validPartnerRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validPartnerRoles.join(', ')}`
      });
    }

    // Check if username or email already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    const user = await User.create({
      username,
      email,
      password,
      role,
      partnerId,
      active
    });

    logger.info(`Partner user created: ${user.id} for partner ${partnerId} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Partner user created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        active: user.active,
        partnerId: user.partnerId
      }
    });
  } catch (error) {
    logger.error('Error creating partner user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create partner user: ' + error.message
    });
  }
});

/**
 * @route   PUT /api/admin/partners/:partnerId/users/:userId
 * @desc    Update a partner user
 * @access  Private (admin)
 */
router.put('/:partnerId/users/:userId', authenticate, requirePermission('partners.manage_users'), async (req, res) => {
  try {
    const { partnerId, userId } = req.params;
    const { username, email, password, role, active } = req.body;

    // Validate partner exists
    const partner = await PartnerCompany.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const user = await User.findOne({
      where: { id: userId, partnerId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate role is a partner role if provided
    if (role) {
      const validPartnerRoles = ['partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'];
      if (!validPartnerRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${validPartnerRoles.join(', ')}`
        });
      }
    }

    const updateData = { username, email, role, active };
    if (password) {
      updateData.password = password;
    }

    await user.update(updateData);

    logger.info(`Partner user updated: ${userId} for partner ${partnerId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Partner user updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        active: user.active,
        partnerId: user.partnerId
      }
    });
  } catch (error) {
    logger.error('Error updating partner user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update partner user: ' + error.message
    });
  }
});

/**
 * @route   DELETE /api/admin/partners/:partnerId/users/:userId
 * @desc    Delete a partner user
 * @access  Private (admin)
 */
router.delete('/:partnerId/users/:userId', authenticate, requirePermission('partners.manage_users'), async (req, res) => {
  try {
    const { partnerId, userId } = req.params;

    const user = await User.findOne({
      where: { id: userId, partnerId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.destroy();

    logger.info(`Partner user deleted: ${userId} for partner ${partnerId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Partner user deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting partner user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete partner user: ' + error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// LOCATION ASSIGNMENT
// ═══════════════════════════════════════════════════════════════

/**
 * @route   POST /api/admin/partners/:partnerId/locations/:locationId/assign
 * @desc    Assign a location to a partner
 * @access  Private (admin)
 */
router.post('/:partnerId/locations/:locationId/assign', authenticate, requirePermission('partners.assign_locations'), async (req, res) => {
  try {
    const { partnerId, locationId } = req.params;
    const {
      productionCostPerWh,
      partnerSharePercent,
      settlementEnabled = true,
      confirmProductionCost = false
    } = req.body;

    // Validate partner exists
    const partner = await PartnerCompany.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }
    if (partner.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Locations can only be assigned to an active partner'
      });
    }

    // Validate location exists
    const location = await Location.findByPk(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }
    if (location.partnerId && Number(location.partnerId) !== Number(partnerId)) {
      return res.status(409).json({
        success: false,
        message: 'Location is already assigned to another partner'
      });
    }

    // Validation
    if (productionCostPerWh !== undefined && productionCostPerWh < 0) {
      return res.status(400).json({
        success: false,
        message: 'Production cost per Wh cannot be negative'
      });
    }

    if (partnerSharePercent !== undefined && (partnerSharePercent < 0 || partnerSharePercent > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Partner share percent must be between 0 and 100'
      });
    }

    // Use partner defaults if not provided
    const finalProductionCost = productionCostPerWh !== undefined ? productionCostPerWh : partner.defaultProductionCostPerWh;
    const finalPartnerShare = partnerSharePercent !== undefined ? partnerSharePercent : partner.defaultPartnerSharePercent;
    if (Number(finalProductionCost) > Number(location.pricePerWh) && !confirmProductionCost) {
      return res.status(409).json({
        success: false,
        code: 'PRODUCTION_COST_ABOVE_SELLING_PRICE',
        message: 'Production cost is greater than the location selling price. Confirmation is required.'
      });
    }

    await location.update({
      partnerId,
      productionCostPerWh: finalProductionCost,
      partnerSharePercent: finalPartnerShare,
      settlementEnabled
    });

    logger.info(`Location ${locationId} assigned to partner ${partnerId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Location assigned to partner successfully',
      location
    });
  } catch (error) {
    logger.error('Error assigning location to partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign location to partner: ' + error.message
    });
  }
});

/**
 * @route   POST /api/admin/locations/:locationId/unassign-partner
 * @desc    Unassign a location from a partner
 * @access  Private (admin)
 */
router.post('/locations/:locationId/unassign-partner', authenticate, requirePermission('partners.assign_locations'), async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await Location.findByPk(locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    await location.update({
      partnerId: null,
      partnerSharePercent: 0,
      settlementEnabled: false
    });

    logger.info(`Location ${locationId} unassigned from partner by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Location unassigned from partner successfully',
      location
    });
  } catch (error) {
    logger.error('Error unassigning location from partner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign location from partner: ' + error.message
    });
  }
});

/**
 * @route   PUT /api/admin/locations/:locationId/partner-pricing
 * @desc    Update partner pricing for a location
 * @access  Private (admin)
 */
router.put('/locations/:locationId/partner-pricing', authenticate, requirePermission('partners.assign_locations'), async (req, res) => {
  try {
    const { locationId } = req.params;
    const { productionCostPerWh, partnerSharePercent, settlementEnabled } = req.body;

    const location = await Location.findByPk(locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    if (!location.partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Location is not assigned to a partner'
      });
    }

    // Validation
    if (productionCostPerWh !== undefined && productionCostPerWh < 0) {
      return res.status(400).json({
        success: false,
        message: 'Production cost per Wh cannot be negative'
      });
    }

    if (partnerSharePercent !== undefined && (partnerSharePercent < 0 || partnerSharePercent > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Partner share percent must be between 0 and 100'
      });
    }

    const updateData = {};
    if (productionCostPerWh !== undefined) updateData.productionCostPerWh = productionCostPerWh;
    if (partnerSharePercent !== undefined) updateData.partnerSharePercent = partnerSharePercent;
    if (settlementEnabled !== undefined) updateData.settlementEnabled = settlementEnabled;

    await location.update(updateData);

    logger.info(`Partner pricing updated for location ${locationId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Partner pricing updated successfully',
      location
    });
  } catch (error) {
    logger.error('Error updating partner pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update partner pricing: ' + error.message
    });
  }
});

module.exports = router;
