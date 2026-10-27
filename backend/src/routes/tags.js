const express = require('express');
const router = express.Router();
const db = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

// Get authorized tags. Remote-start search is deliberately tag-first, while
// still allowing operators to find the tag by the linked user's name/email.
router.get('/', authenticate, async (req, res) => {
    try {
        const query = String(req.query.q || req.query.search || '').trim();
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
        const userWhere = { status: 'active' };
        if (query) {
            const pattern = `%${query}%`;
            userWhere[Op.or] = [
                { tagId: { [Op.iLike]: pattern } },
                { legacyTagId: { [Op.iLike]: pattern } },
                { name: { [Op.iLike]: pattern } },
                { email: { [Op.iLike]: pattern } },
                { phone: { [Op.iLike]: pattern } }
            ];
        }
        const users = await db.MobileUser.findAll({
            where: userWhere,
            attributes: ['id', 'name', 'email', 'phone', 'tagId', 'legacyTagId'],
            limit,
            order: [['tagId', 'ASC']]
        });
        const userTagIds = [...new Set(users.flatMap(user => [user.tagId, user.legacyTagId]).filter(Boolean))];
        const tagWhere = { status: 'Active' };
        if (query) {
            tagWhere[Op.or] = [
                { tagId: { [Op.iLike]: `%${query}%` } },
                ...(userTagIds.length ? [{ tagId: { [Op.in]: userTagIds } }] : [])
            ];
        }
        const tags = await db.AuthorizedTag.findAll({
            where: tagWhere,
            attributes: ['id', 'tagId', 'status', 'expiryDate'],
            order: [['tagId', 'ASC']],
            limit
        });
        const usersByTag = new Map(users.flatMap(user => [user.tagId, user.legacyTagId].filter(Boolean).map(tagId => [tagId, user.toJSON()])));

        res.json({
            success: true,
            tags: tags.map(tag => ({ ...tag.toJSON(), user: usersByTag.get(tag.tagId) || null }))
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
