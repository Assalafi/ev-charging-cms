const fs = require('fs');
const path = require('path');

const AD_TITLE_MAX_LENGTH = 15;
const AD_BODY_MAX_LENGTH = 50;
const AD_MAX_ORDER = 100000;
const AD_PHOTO_PREFIX = '/uploads/ads/';
const AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
});

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
}

function adsDirectory() {
  return path.join(uploadsRoot(), 'ads');
}

function imageExtension(mimeType) {
  return IMAGE_EXTENSIONS[String(mimeType || '').toLowerCase()] || null;
}

function parseBoolean(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

function validateAdInput(body = {}, { partial = false } = {}) {
  const data = {};
  const errors = [];
  const has = key => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('title')) {
    const title = String(body.title ?? '').trim();
    if (!title) errors.push('Title is required');
    else if (title.length > AD_TITLE_MAX_LENGTH) errors.push(`Title must be ${AD_TITLE_MAX_LENGTH} characters or less`);
    else data.title = title;
  }

  if (!partial || has('body')) {
    const text = String(body.body ?? '').trim();
    if (!text) errors.push('Body is required');
    else if (text.length > AD_BODY_MAX_LENGTH) errors.push(`Body must be ${AD_BODY_MAX_LENGTH} characters or less`);
    else data.body = text;
  }

  if (!partial || has('order')) {
    const order = body.order === undefined || body.order === null || body.order === ''
      ? 0
      : Number(body.order);
    if (!Number.isInteger(order) || order < 0 || order > AD_MAX_ORDER) {
      errors.push(`Display order must be a whole number between 0 and ${AD_MAX_ORDER}`);
    } else {
      data.order = order;
    }
  }

  if (!partial || has('status')) {
    const status = String(body.status || 'active').toLowerCase();
    if (!['active', 'inactive'].includes(status)) errors.push('Status must be active or inactive');
    else data.status = status;
  }

  return { data, errors, removePhoto: parseBoolean(body.removePhoto) };
}

function isRecognizedImage(filePath, mimeType) {
  const expected = imageExtension(mimeType);
  if (!expected || !filePath || !fs.existsSync(filePath)) return false;

  const handle = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(12);
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(handle, header, 0, header.length, 0);
  } finally {
    fs.closeSync(handle);
  }

  if (bytesRead < 4) return false;
  if (expected === '.jpg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (expected === '.png') return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (expected === '.gif') return ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString('ascii'));
  if (expected === '.webp') return header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function ownedAdPhotoPath(photo) {
  const value = String(photo || '');
  if (!value.startsWith(AD_PHOTO_PREFIX)) return null;
  const directory = path.resolve(adsDirectory());
  const target = path.resolve(directory, path.basename(value));
  return target.startsWith(`${directory}${path.sep}`) ? target : null;
}

function removeOwnedAdPhoto(photo) {
  const target = ownedAdPhotoPath(photo);
  if (!target || !fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

function publicAssetUrl(req, value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const configuredOrigin = String(process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || '')
    .split(',')
    .map(item => item.trim())
    .find(item => /^https?:\/\//i.test(item));
  const forwardedProtocol = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProtocol || req?.protocol || 'https';
  const origin = configuredOrigin || `${protocol}://${req.get('host')}`;
  return new URL(value, `${origin.replace(/\/$/, '')}/`).toString();
}

function mobileAdPayload(req, item) {
  const photoPath = item.photo || null;
  return {
    ...item,
    // Keep the established mobile contract: the currently released Flutter
    // app prefixes this relative path with the EV Charge origin.
    photo: photoPath,
    photoPath,
    // Newer clients can consume the ready-to-use absolute URL instead.
    photoUrl: publicAssetUrl(req, photoPath)
  };
}

module.exports = {
  AD_TITLE_MAX_LENGTH,
  AD_BODY_MAX_LENGTH,
  AD_MAX_ORDER,
  AD_PHOTO_PREFIX,
  AD_IMAGE_MAX_BYTES,
  IMAGE_EXTENSIONS,
  uploadsRoot,
  adsDirectory,
  imageExtension,
  validateAdInput,
  isRecognizedImage,
  ownedAdPhotoPath,
  removeOwnedAdPhoto,
  publicAssetUrl,
  mobileAdPayload
};
