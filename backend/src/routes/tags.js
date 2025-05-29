const express = require('express');
const router = express.Router();
const db = require('../models');
const logger = require('../utils/logger');

// Get all authorized tags
router.get('/', async (req, res) => {
    try {
        const tags = await db.AuthorizedTag.findAll({
            where: {
                status: 'Active'
            },
            attributes: ['id', 'tagId', 'status', 'expiryDate'],
            order: [['tagId', 'ASC']]
        });

        res.json({
            success: true,
            tags
        });
    } catch (error) {
        logger.error('Error fetching authorized tags:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching authorized tags',
            error: error.message
        });
    }
});

module.exports = router;
