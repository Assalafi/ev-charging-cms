const express = require('express');
const router = express.Router();
const { AdsBoard } = require('../models');
const logger = require('../utils/logger');
const { publicAssetUrl } = require('../utils/adsBoard');

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

    const data = ads.map(ad => {
      const item = ad.toJSON();
      return {
        ...item,
        photoPath: item.photo,
        photo: publicAssetUrl(req, item.photo)
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data,
      count: data.length,
      serverTime: new Date().toISOString()
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
