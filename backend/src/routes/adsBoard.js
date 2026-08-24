const express = require('express');
const router = express.Router();
const { AdsBoard } = require('../models');
const logger = require('../utils/logger');

// Get active ads for mobile app (public endpoint)
router.get('/', async (req, res) => {
  try {
    const ads = await AdsBoard.findAll({
      where: {
        status: 'active'
      },
      order: [['order', 'ASC'], ['createdat', 'DESC']],
      attributes: ['id', 'title', 'body', 'photo', 'order']
    });

    res.json({
      success: true,
      data: ads
    });
  } catch (error) {
    logger.error('Error fetching active ads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ads'
    });
  }
});

module.exports = router;
