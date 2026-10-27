const express = require('express');
const router = express.Router();
const { MobileUser, AuthorizedTag, Transaction, SubscriptionCompany } = require('../../models');
const { Op } = require('sequelize');
const { tagAliases } = require('../../services/chargerTagService');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const logger = require('../../utils/logger');

// Get all mobile users with pagination and search
router.get('/', authenticate, requirePermission('mobile_users.view'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const whereClause = search ? {
      [require('sequelize').Op.and]: [
        {
          [require('sequelize').Op.or]: [
            { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
            { email: { [require('sequelize').Op.iLike]: `%${search}%` } },
            { phone: { [require('sequelize').Op.iLike]: `%${search}%` } },
            { tagId: { [require('sequelize').Op.iLike]: `%${search}%` } },
            { legacyTagId: { [require('sequelize').Op.iLike]: `%${search}%` } }
          ]
        },
        { status: { [require('sequelize').Op.ne]: 'deleted' } }
      ]
    } : { status: { [require('sequelize').Op.ne]: 'deleted' } };

    const { count, rows: users } = await MobileUser.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: AuthorizedTag,
          as: 'authorizedTag',
          attributes: ['tagId', 'status', 'expiryDate']
        },
        {
          model: Transaction,
          as: 'transactions',
          attributes: ['transactionId', 'startTime', 'stopTime', 'energyDelivered', 'amount', 'status'],
          limit: 5,
          order: [['startTime', 'DESC']]
        },
        {
          model: Transaction,
          as: 'legacyTransactions',
          attributes: ['transactionId', 'startTime', 'stopTime', 'energyDelivered', 'amount', 'status'],
          limit: 5,
          order: [['startTime', 'DESC']]
        },
        {
          model: SubscriptionCompany,
          as: 'company',
          attributes: ['id', 'name', 'status'],
          required: false
        }
      ],
      order: [['name', 'ASC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    // Present one chronological history to the admin even though the two
    // associations are kept separate internally (canonical vs legacy tag).
    users.forEach(user => {
      const combined = [...(user.transactions || []), ...(user.legacyTransactions || [])]
        .sort((left, right) => new Date(right.startTime || 0) - new Date(left.startTime || 0))
        .slice(0, 5);
      user.setDataValue('transactions', combined);
      user.setDataValue('legacyTransactions', undefined);
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers: count,
          limit
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching mobile users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mobile users'
    });
  }
});

// Get mobile user statistics
router.get('/stats', authenticate, requirePermission('mobile_users.view'), async (req, res) => {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [totalUsers, activeUsers, suspendedUsers, deletedUsers, newThisMonth] = await Promise.all([
      MobileUser.count(),
      MobileUser.count({ where: { status: 'active' } }),
      MobileUser.count({ where: { status: 'suspended' } }),
      MobileUser.count({ where: { status: 'deleted' } }),
      MobileUser.count({
        where: {
          createdAt: {
            [require('sequelize').Op.gte]: firstDayOfMonth
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        deletedUsers,
        newThisMonth
      }
    });
  } catch (error) {
    logger.error('Error fetching mobile user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
});

// Get mobile user details by ID
router.get('/:id', authenticate, requirePermission('mobile_users.view'), async (req, res) => {
  try {
    const user = await MobileUser.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: AuthorizedTag,
          as: 'authorizedTag'
        },
        {
          model: Transaction,
          as: 'transactions',
          order: [['startTime', 'DESC']]
        },
        {
          model: Transaction,
          as: 'legacyTransactions',
          order: [['startTime', 'DESC']]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const combinedTransactions = [...(user.transactions || []), ...(user.legacyTransactions || [])]
      .sort((left, right) => new Date(right.startTime || 0) - new Date(left.startTime || 0));
    user.setDataValue('transactions', combinedTransactions);
    user.setDataValue('legacyTransactions', undefined);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Error fetching mobile user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
  }
});

// Update mobile user status
router.put('/:id/status', authenticate, requirePermission('mobile_users.manage'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const user = await MobileUser.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Handle soft delete
    if (status === 'deleted') {
      await user.softDelete();
    } else {
      await user.update({ 
        status,
        active: status === 'active',
        deletedAt: status === 'deleted' ? new Date() : null
      });
    }

    // Keep both the canonical and historical alias credentials in sync.
    await AuthorizedTag.update({
      status: status === 'active' ? 'Active' : 'Blocked',
      blocked: status !== 'active'
    }, { where: { tagId: { [Op.in]: tagAliases(user) } } });

    res.json({
      success: true,
      message: `User ${status === 'deleted' ? 'deleted' : 'status updated'} successfully`,
      data: user
    });
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

module.exports = router;
