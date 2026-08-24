const express = require('express');
const router = express.Router();
const { AdsBoard } = require('../../models');
const { authenticate, authorize } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../../uploads/ads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ad-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Get all ads with pagination
router.get('/', ...authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows: ads } = await AdsBoard.findAndCountAll({
      order: [['order', 'ASC'], ['createdat', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        ads,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalAds: count,
          limit
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching ads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ads'
    });
  }
});

// Get ad by ID
router.get('/:id', ...authorize('admin'), async (req, res) => {
  try {
    const ad = await AdsBoard.findByPk(req.params.id);
    
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found'
      });
    }

    res.json({
      success: true,
      data: ad
    });
  } catch (error) {
    logger.error('Error fetching ad:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ad'
    });
  }
});

// Create new ad
router.post('/', ...authorize('admin'), upload.single('photo'), async (req, res) => {
  try {
    const { title, body, order, status } = req.body;

    // Validate input
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required'
      });
    }

    if (title.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Title must be 50 characters or less'
      });
    }

    if (body.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Body must be 50 characters or less'
      });
    }

    const adData = {
      title,
      body,
      order: parseInt(order) || 0,
      status: status || 'active'
    };

    // Add photo URL if uploaded
    if (req.file) {
      adData.photo = `/uploads/ads/${req.file.filename}`;
    }

    const ad = await AdsBoard.create(adData);

    res.status(201).json({
      success: true,
      message: 'Ad created successfully',
      data: ad
    });
  } catch (error) {
    logger.error('Error creating ad:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ad'
    });
  }
});

// Update ad (JSON and FormData with file)
router.put('/:id', ...authorize('admin'), upload.single('photo'), async (req, res) => {
  try {
    const ad = await AdsBoard.findByPk(req.params.id);
    
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found'
      });
    }

    // Handle both JSON and FormData
    let title, body, order, status;
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      // FormData case
      title = req.body.title;
      body = req.body.body;
      order = req.body.order;
      status = req.body.status;
    } else {
      // JSON case
      ({ title, body, order, status } = req.body);
    }
    const updateData = {};

    // Validate and update fields
    if (title !== undefined) {
      if (title.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Title must be 50 characters or less'
        });
      }
      updateData.title = title;
    }

    if (body !== undefined) {
      if (body.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Body must be 50 characters or less'
        });
      }
      updateData.body = body;
    }

    if (order !== undefined) {
      updateData.order = parseInt(order);
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    // Update photo if new one uploaded
    if (req.file) {
      // Delete old photo if exists
      if (ad.photo) {
        const oldPhotoPath = path.join(__dirname, '../../../..', ad.photo);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      updateData.photo = `/uploads/ads/${req.file.filename}`;
    }

    await ad.update(updateData);

    res.json({
      success: true,
      message: 'Ad updated successfully',
      data: ad
    });
  } catch (error) {
    logger.error('Error updating ad:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ad'
    });
  }
});

// Update ad without file upload (FormData only)
router.put('/:id/no-file', ...authorize('admin'), async (req, res) => {
  try {
    const ad = await AdsBoard.findByPk(req.params.id);
    
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found'
      });
    }

    // Handle FormData without file
    const { title, body, order, status } = req.body;
    const updateData = {};

    // Validate and update fields
    if (title !== undefined) {
      if (title.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Title must be 50 characters or less'
        });
      }
      updateData.title = title;
    }

    if (body !== undefined) {
      if (body.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Body must be 50 characters or less'
        });
      }
      updateData.body = body;
    }

    if (order !== undefined) {
      updateData.order = parseInt(order);
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    await ad.update(updateData);

    res.json({
      success: true,
      message: 'Ad updated successfully',
      data: ad
    });
  } catch (error) {
    logger.error('Error updating ad:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ad'
    });
  }
});

// Delete ad
router.delete('/:id', ...authorize('admin'), async (req, res) => {
  try {
    const ad = await AdsBoard.findByPk(req.params.id);
    
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found'
      });
    }

    // Delete photo file if exists
    if (ad.photo) {
      const photoPath = path.join(__dirname, '../../../..', ad.photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    await ad.destroy();

    res.json({
      success: true,
      message: 'Ad deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting ad:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ad'
    });
  }
});

// Update ad status
router.put('/:id/status', ...authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const ad = await AdsBoard.findByPk(req.params.id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found'
      });
    }

    await ad.update({ status });

    res.json({
      success: true,
      message: 'Ad status updated successfully',
      data: ad
    });
  } catch (error) {
    logger.error('Error updating ad status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ad status'
    });
  }
});

module.exports = router;
