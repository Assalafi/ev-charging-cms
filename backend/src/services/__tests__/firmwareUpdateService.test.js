const mockFirmwareUpdate = {
  findOne: jest.fn(),
};

jest.mock('../../models', () => ({ FirmwareUpdate: mockFirmwareUpdate }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const {
  statusChanges,
  recordFirmwareStatus,
  recordCommandResponse,
  recordBootFirmwareVersion,
} = require('../firmwareUpdateService');

describe('firmware update lifecycle tracking', () => {
  const at = new Date('2026-10-24T20:00:00.000Z');
  let update;

  beforeEach(() => {
    jest.clearAllMocks();
    update = {
      id: 4,
      status: 'CommandSent',
      targetVersion: '2.4.1',
      update: jest.fn().mockResolvedValue(),
    };
    mockFirmwareUpdate.findOne.mockResolvedValue(update);
  });

  test('maps OCPP progress statuses to durable milestone timestamps', () => {
    expect(statusChanges('Downloading', at)).toMatchObject({
      status: 'Downloading',
      lastStatusAt: at,
      downloadStartedAt: at,
    });
    expect(statusChanges('Installed', at)).toMatchObject({
      status: 'Installed',
      lastStatusAt: at,
      completedAt: at,
    });
  });

  test('persists a valid FirmwareStatusNotification against the active request', async () => {
    const result = await recordFirmwareStatus('CP-1', 'Installing', at);

    expect(result).toBe(update);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'Installing',
      installationStartedAt: at,
    }));
  });

  test('does not let a late empty command acknowledgement overwrite progress', async () => {
    update.status = 'Downloading';

    await recordCommandResponse('CP-1', 'message-1', { success: true });

    expect(update.update).not.toHaveBeenCalled();
  });

  test('confirms installation when BootNotification reports the requested version', async () => {
    update.status = 'Installing';

    await recordBootFirmwareVersion('CP-1', '2.4.1', at);

    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'Installed',
      currentFirmwareVersion: '2.4.1',
      completedAt: at,
    }));
  });

  test('records a CALLERROR as a command failure', async () => {
    await recordCommandResponse('CP-1', 'message-1', {
      success: false,
      message: 'NotSupported: UpdateFirmware is unavailable',
    });

    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'CommandFailed',
      statusMessage: 'NotSupported: UpdateFirmware is unavailable',
      failedAt: expect.any(Date),
    }));
  });
});
