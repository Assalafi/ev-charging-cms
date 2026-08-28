const fs = require('fs');
const os = require('os');
const path = require('path');

describe('ads board utilities', () => {
  let temporaryUploads;
  let utilities;

  beforeEach(() => {
    jest.resetModules();
    temporaryUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-board-test-'));
    process.env.UPLOADS_DIR = temporaryUploads;
    utilities = require('../adsBoard');
    fs.mkdirSync(utilities.adsDirectory(), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(temporaryUploads, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  test('enforces the database title limit and trims valid content', () => {
    expect(utilities.validateAdInput({
      title: '  Summer offer  ',
      body: '  Charge and save  ',
      order: '2',
      status: 'ACTIVE'
    })).toMatchObject({
      data: { title: 'Summer offer', body: 'Charge and save', order: 2, status: 'active' },
      errors: []
    });

    const invalid = utilities.validateAdInput({
      title: '1234567890123456',
      body: 'Valid body',
      order: 0,
      status: 'active'
    });
    expect(invalid.errors).toContain('Title must be 15 characters or less');
  });

  test('rejects invalid status, order and empty partial values', () => {
    const result = utilities.validateAdInput({ title: ' ', order: '-1', status: 'draft' }, { partial: true });
    expect(result.errors).toEqual(expect.arrayContaining([
      'Title is required',
      'Display order must be a whole number between 0 and 100000',
      'Status must be active or inactive'
    ]));
  });

  test('checks image content signatures instead of trusting the MIME type', () => {
    const validPng = path.join(utilities.adsDirectory(), 'valid.png');
    const fakePng = path.join(utilities.adsDirectory(), 'fake.png');
    fs.writeFileSync(validPng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
    fs.writeFileSync(fakePng, Buffer.from('not an image'));
    expect(utilities.isRecognizedImage(validPng, 'image/png')).toBe(true);
    expect(utilities.isRecognizedImage(fakePng, 'image/png')).toBe(false);
  });

  test('only resolves and removes files owned by the ads directory', () => {
    const owned = path.join(utilities.adsDirectory(), 'ad-test.png');
    fs.writeFileSync(owned, 'test');
    expect(utilities.ownedAdPhotoPath('/uploads/ads/ad-test.png')).toBe(owned);
    expect(utilities.ownedAdPhotoPath('/uploads/other/private.png')).toBeNull();
    expect(utilities.removeOwnedAdPhoto('/uploads/ads/ad-test.png')).toBe(true);
    expect(fs.existsSync(owned)).toBe(false);
  });

  test('builds an absolute mobile image URL while retaining HTTPS configuration', () => {
    process.env.CORS_ORIGIN = 'https://evcharging.eride.ng,http://localhost:3000';
    expect(utilities.publicAssetUrl({}, '/uploads/ads/example.png')).toBe('https://evcharging.eride.ng/uploads/ads/example.png');
    delete process.env.CORS_ORIGIN;
  });

  test('keeps the released mobile photo field relative and exposes an absolute alternative', () => {
    process.env.CORS_ORIGIN = 'https://evcharging.eride.ng';
    expect(utilities.mobileAdPayload({}, {
      id: 8,
      title: 'Welcome',
      photo: '/uploads/ads/example.png'
    })).toMatchObject({
      photo: '/uploads/ads/example.png',
      photoPath: '/uploads/ads/example.png',
      photoUrl: 'https://evcharging.eride.ng/uploads/ads/example.png'
    });
    delete process.env.CORS_ORIGIN;
  });
});
