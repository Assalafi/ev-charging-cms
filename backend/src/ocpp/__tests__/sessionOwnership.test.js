const mockOcppMessage = {
  findAll: jest.fn(),
  findOne: jest.fn(),
}
const mockTransaction = {
  findOne: jest.fn(),
  findAll: jest.fn(),
}
const mockFindRemoteStart = jest.fn()
const mockGetRemoteOwner = jest.fn()

jest.mock('../../models', () => ({
  OcppMessage: mockOcppMessage,
  Transaction: mockTransaction,
}))
jest.mock('../../utils/logger', () => ({ warn: jest.fn() }))
jest.mock('../remoteStartCorrelation', () => ({
  REMOTE_START_SESSION_WINDOW_MS: 2 * 60 * 60 * 1000,
  findVerifiedRemoteStartIntent: mockFindRemoteStart,
  getVerifiedRemoteStartOwner: mockGetRemoteOwner,
}))

const {
  findStartTransactionEvidence,
  resolveStopTransactionOwnership,
} = require('../sessionOwnership')

function startRequest(overrides = {}) {
  return {
    messageId: 'start-55',
    chargePointId: 'CP-1',
    payload: {
      connectorId: 1,
      idTag: 'MOB-OWNER',
      meterStart: 120,
      timestamp: '2026-10-24T10:00:00.000Z',
    },
    responsePayload: {
      transactionId: 778899,
      idTagInfo: { status: 'Accepted' },
    },
    createdAt: new Date('2026-10-24T10:00:02.000Z'),
    ...overrides,
  }
}

describe('durable OCPP session ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOcppMessage.findOne.mockResolvedValue(null)
    mockOcppMessage.findAll.mockResolvedValue([])
    mockTransaction.findOne.mockResolvedValue(null)
    mockTransaction.findAll.mockResolvedValue([])
    mockFindRemoteStart.mockResolvedValue(null)
    mockGetRemoteOwner.mockReturnValue(null)
  })

  test('reconstructs tag and connector from the StartTransaction request/confirmation pair', async () => {
    mockOcppMessage.findAll.mockResolvedValue([startRequest()])

    const evidence = await findStartTransactionEvidence({
      chargePointId: 'CP-1',
      ocppTransactionId: 778899,
      receivedBefore: new Date('2026-10-24T10:05:00.000Z'),
    })

    expect(evidence).toMatchObject({
      chargePointId: 'CP-1',
      connectorId: 1,
      idTag: 'MOB-OWNER',
      messageId: 'start-55',
      ocppTransactionId: 778899,
    })
  })

  test('never resolves a StopTransaction merely because one station transaction is active', async () => {
    const result = await resolveStopTransactionOwnership({
      chargePointId: 'CP-1',
      ocppTransactionId: 900001,
      status: 'InProgress',
    })

    expect(result).toBeNull()
    expect(mockTransaction.findAll).toHaveBeenCalled()
  })

  test('uses a persisted exact OCPP transaction link without changing its owner', async () => {
    const active = {
      transactionId: 123456,
      ocppTransactionId: 778899,
      idTag: 'MOB-OWNER',
      chargePointId: 'CP-1',
      connectorId: 1,
      ownershipSource: 'start_transaction',
      ownershipVerifiedAt: new Date(),
      update: jest.fn(),
    }
    mockTransaction.findOne.mockResolvedValue(active)

    const result = await resolveStopTransactionOwnership({
      chargePointId: 'CP-1',
      ocppTransactionId: 778899,
      status: 'InProgress',
    })

    expect(result).toBe(active)
    expect(active.idTag).toBe('MOB-OWNER')
  })

  test('maps legacy rows only when the StartTransaction audit owner matches', async () => {
    const active = {
      transactionId: 778899,
      ocppTransactionId: null,
      ocppStartMessageId: null,
      ownershipSource: null,
      ownershipVerifiedAt: null,
      idTag: 'MOB-OWNER',
      chargePointId: 'CP-1',
      connectorId: 1,
      update: jest.fn(async changes => Object.assign(active, changes)),
    }
    mockTransaction.findOne.mockResolvedValueOnce(null)
    mockOcppMessage.findAll.mockResolvedValue([startRequest()])
    mockTransaction.findAll.mockResolvedValue([active])

    const result = await resolveStopTransactionOwnership({
      chargePointId: 'CP-1',
      ocppTransactionId: 778899,
      status: 'InProgress',
      receivedAt: new Date('2026-10-24T10:05:00.000Z'),
    })

    expect(result).toBe(active)
    expect(active.update).toHaveBeenCalledWith(expect.objectContaining({
      ocppTransactionId: 778899,
      ocppStartMessageId: 'start-55',
      ownershipSource: 'start_transaction_audit',
    }))
  })

  test('never treats a CMS-only recovery ID as a charger transaction ID', async () => {
    const recovery = {
      transactionId: 778899,
      ocppTransactionId: 445566,
      idTag: 'MOB-OWNER',
      chargePointId: 'CP-1',
      connectorId: 1,
      reason: 'OCPP_VERIFIED_REMOTE_START_RECOVERY',
      ownershipSource: 'verified_remote_start_recovery',
      update: jest.fn(),
    }
    mockTransaction.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recovery)

    const result = await resolveStopTransactionOwnership({
      chargePointId: 'CP-1',
      ocppTransactionId: 778899,
      status: 'InProgress',
    })

    expect(result).toBeNull()
    expect(recovery.update).not.toHaveBeenCalled()
  })
})
