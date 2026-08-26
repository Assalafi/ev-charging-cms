const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { Op } = require('sequelize');
const { AdsBoard } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const logger = require('../../utils/logger');
const {
  AD_IMAGE_MAX_BYTES,
  AD_PHOTO_PREFIX,
  IMAGE_EXTENSIONS,
  adsDirectory,
  imageExtension,
  isRecognizedImage,
  removeOwnedAdPhoto,
  validateAdInput
} = require('../../utils/adsBoard');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const directory = adsDirectory();
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename: (req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `ad-${suffix}${imageExtension(file.mimetype) || '.img'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: AD_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!Object.prototype.hasOwnProperty.call(IMAGE_EXTENSIONS, String(file.mimetype || '').toLowerCase())) {
      return callback(new Error('Image must be a JPG, PNG, GIF or WebP file'));
    }
    callback(null, true);
  }
});

function parsePhoto(req, res, next) {
  upload.single('photo')(req, res, error => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must not exceed 5 MB'
      : error.message || 'Invalid image upload';
    return res.status(400).json({ success: false, message });
  });
}

function cleanupUploadedFile(file) {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (error) {
    logger.warn(`Unable to clean up rejected ad image ${file.filename}: ${error.message}`);
  }
}

function removePreviousPhoto(photo) {
  try {
    removeOwnedAdPhoto(photo);
  } catch (error) {
    logger.warn(`Unable to remove replaced ad image: ${error.message}`);
  }
}

function validateUploadedPhoto(req, res) {
  if (!req.file) return true;
  if (isRecognizedImage(req.file.path, req.file.mimetype)) return true;
  cleanupUploadedFile(req.file);
  res.status(400).json({ success: false, message: 'The uploaded file content is not a valid image' });
  return false;
}

function parseRecordId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', authenticate, requirePermission('ads.view'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const status = String(req.query.status || 'all').toLowerCase();
    const search = String(req.query.search || '').trim().slice(0, 100);
    const where = {};

    if (['active', 'inactive'].includes(status)) where.status = status;
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { body: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: ads } = await AdsBoard.findAndCountAll({
      where,
      order: [['order', 'ASC'], ['createdat', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    res.set('Cache-Control', 'no-store');
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
    res.status(500).json({ success: false, message: 'Failed to fetch ads' });
  }
});

router.get('/:id', authenticate, requirePermission('ads.view'), async (req, res) => {
  try {
    const id = parseRecordId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid ad ID' });
    const ad = await AdsBoard.findByPk(id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: ad });
  } catch (error) {
    logger.error('Error fetching ad:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ad' });
  }
});

router.post('/', authenticate, requirePermission('ads.manage'), parsePhoto, async (req, res) => {
  try {
    if (!validateUploadedPhoto(req, res)) return;
    const { data, errors } = validateAdInput(req.body);
    if (errors.length) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    if (req.file) data.photo = `${AD_PHOTO_PREFIX}${req.file.filename}`;

    const ad = await AdsBoard.create(data);
    return res.status(201).json({ success: true, message: 'Ad created successfully', data: ad });
  } catch (error) {
    cleanupUploadedFile(req.file);
    logger.error('Error creating ad:', error);
    return res.status(500).json({ success: false, message: 'Failed to create ad' });
  }
});

async function updateAd(req, res) {
  let newPhoto = null;
  try {
    if (!validateUploadedPhoto(req, res)) return;
    const id = parseRecordId(req.params.id);
    if (!id) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ success: false, message: 'Invalid ad ID' });
    }

    const ad = await AdsBoard.findByPk(id);
    if (!ad) {
      cleanupUploadedFile(req.file);
      return res.status(404).json({ success: false, message: 'Ad not found' });
    }

    const { data, errors, removePhoto } = validateAdInput(req.body, { partial: true });
    if (errors.length) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const previousPhoto = ad.photo;
    if (req.file) {
      newPhoto = `${AD_PHOTO_PREFIX}${req.file.filename}`;
      data.photo = newPhoto;
    } else if (removePhoto) {
      data.photo = null;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, message: 'No changes were provided' });
    }

    await ad.update(data);
    if (previousPhoto && previousPhoto !== ad.photo) removePreviousPhoto(previousPhoto);
    return res.json({ success: true, message: 'Ad updated successfully', data: ad });
  } catch (error) {
    if (newPhoto) cleanupUploadedFile(req.file);
    logger.error(`Error updating ad ${req.params.id}:`, error);
    return res.status(500).json({ success: false, message: 'Failed to update ad' });
  }
}

router.put('/:id', authenticate, requirePermission('ads.manage'), parsePhoto, updateAd);
// Backward-compatible alias for older admin clients.
router.put('/:id/no-file', authenticate, requirePermission('ads.manage'), updateAd);

router.delete('/:id', authenticate, requirePermission('ads.manage'), async (req, res) => {
  try {
    const id = parseRecordId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid ad ID' });
    const ad = await AdsBoard.findByPk(id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });

    const previousPhoto = ad.photo;
    await ad.destroy();
    if (previousPhoto) removePreviousPhoto(previousPhoto);
    return res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting ad ${req.params.id}:`, error);
    return res.status(500).json({ success: false, message: 'Failed to delete ad' });
  }
});

router.put('/:id/status', authenticate, requirePermission('ads.manage'), async (req, res) => {
  try {
    const id = parseRecordId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid ad ID' });
    const status = String(req.body.status || '').toLowerCase();
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
    }

    const ad = await AdsBoard.findByPk(id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    await ad.update({ status });
    return res.json({ success: true, message: 'Ad status updated successfully', data: ad });
  } catch (error) {
    logger.error(`Error updating ad status ${req.params.id}:`, error);
    return res.status(500).json({ success: false, message: 'Failed to update ad status' });
  }
});

module.exports = router;
