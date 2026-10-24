const mockOcppMessage = {
  findAll: jest.fn(),
  findOne: jest.fn(),
}

jest.mock('../../models', () => ({ OcppMessage: mockOcppMessage }))
jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
}))

const {
  findVerifiedRemoteStartIntent,
  getVerifiedRemoteStartOwner,
} = require('../remoteStartCorrelation')

const now = new Date('2026-10-24T11:40:00.000Z')
const requestTime = new Date('2026-10-24T11:29:22.000Z')
const acceptedTime = new Date('2026-10-24T11:29:23.000Z')

function remoteStartRow(overrides = {}) {
  return {
    messageId: 'remote-1',
    payload: { connectorId: 1, idTag: 'MOB-NEW' },
    createdAt: requestTime,
    ...overrides,
  }
}

function chargingRow(overrides = {}) {
  return {
    payload: { connectorId: 1, status: 'Charging' },
    createdAt: new Date('2026-10-24T11:29:49.000Z'),
    ...overrides,
  }
}

function availableRow(overrides = {}) {
  return {
    payload: { connectorId: 1, status: 'Available' },
    createdAt: new Date('2026-10-24T11:28:00.000Z'),
    ...overrides,
  }
}

describe('verified RemoteStart ownership correlation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOcppMessage.findAll.mockImplementation(async ({ where }) => {
      if (where.message_type === 'RemoteStartTransaction') return [remoteStartRow()]
      if (where.message_type === 'StatusNotification') return [chargingRow(), availableRow()]
      return []
    })
  })

  test('requires the charge point Accepted response before exposing an owner', async () => {
    mockOcppMessage.findOne.mockResolvedValue(null)

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      meterTimestamp: '2026-10-24T11:38:00.000Z',
      now,
    })

    expect(intent).toBeNull()
    expect(getVerifiedRemoteStartOwner(intent, 1)).toBeNull()
  })

  test('rejects a charger-rejected RemoteStart', async () => {
    mockOcppMessage.findOne.mockResolvedValue({
      payload: JSON.stringify({ status: 'Rejected' }),
      createdAt: acceptedTime,
    })

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      now,
    })

    expect(intent).toBeNull()
  })

  test('requires Charging confirmation on the same connector for billing recovery', async () => {
    mockOcppMessage.findOne.mockResolvedValue({
      payload: { status: 'Accepted' },
      createdAt: acceptedTime,
    })
    mockOcppMessage.findAll.mockImplementation(async ({ where }) => {
      if (where.message_type === 'RemoteStartTransaction') return [remoteStartRow()]
      if (where.message_type === 'StatusNotification') {
        return [
          chargingRow({ payload: { connectorId: 2, status: 'Charging' } }),
          availableRow(),
        ]
      }
      return []
    })

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      now,
    })

    expect(intent).toBeNull()
  })

  test('returns only the accepted, connector-matched owner after Charging is confirmed', async () => {
    mockOcppMessage.findOne.mockResolvedValue({
      payload: JSON.stringify({ status: 'Accepted' }),
      createdAt: acceptedTime,
    })

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      meterTimestamp: '2026-10-24T11:38:00.000Z',
      now,
    })

    expect(intent).toMatchObject({
      idTag: 'MOB-NEW',
      connectorId: 1,
      messageId: 'remote-1',
      verified: true,
      chargingConfirmed: true,
      safeChargingTransition: true,
    })
    expect(getVerifiedRemoteStartOwner(intent, 1)).toBe('MOB-NEW')
    expect(getVerifiedRemoteStartOwner(intent, 2)).toBeNull()
  })

  test('rejects an Accepted RemoteStart when the connector was already Charging', async () => {
    mockOcppMessage.findOne.mockResolvedValue({
      payload: { status: 'Accepted' },
      createdAt: acceptedTime,
    })
    mockOcppMessage.findAll.mockImplementation(async ({ where }) => {
      if (where.message_type === 'RemoteStartTransaction') return [remoteStartRow()]
      if (where.message_type === 'StatusNotification') {
        return [
          chargingRow(),
          chargingRow({ createdAt: new Date('2026-10-24T11:28:00.000Z') }),
        ]
      }
      return []
    })

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      now,
    })

    expect(intent).toBeNull()
  })

  test('blocks delayed samples timestamped before the verified RemoteStart', async () => {
    mockOcppMessage.findOne.mockResolvedValue({
      payload: { status: 'Accepted' },
      createdAt: acceptedTime,
    })

    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: 'CP-1',
      connectorId: 1,
      meterTimestamp: '2026-10-24T11:20:00.000Z',
      now,
    })

    expect(intent).toMatchObject({ verified: true, blocked: true })
    expect(getVerifiedRemoteStartOwner(intent, 1)).toBeNull()
  })
})
