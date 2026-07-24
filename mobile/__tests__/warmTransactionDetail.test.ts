jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

const mockApiFetch = jest.fn()
jest.mock('../src/query/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const mockReadCached = jest.fn()
const mockWriteCached = jest.fn().mockResolvedValue(undefined)
jest.mock('../src/lib/transactionDetailCache', () => ({
  readCachedTransactionDetail: (...args: unknown[]) => mockReadCached(...args),
  writeCachedTransactionDetail: (...args: unknown[]) => mockWriteCached(...args),
}))

import { QueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import {
  seedTransactionDetailFromDisk,
  warmTransactionDetailForNavigation,
  type TransactionDetailResponse,
} from '../src/hooks/queries/use-transactions'

const scope = { kind: 'personal' as const, userId: 'user-1' }
const ledgerId = '6ec5b65f-2d65-4208-999f-86e3c4e67c35'
const etid = 'ETID88873887'

describe('warmTransactionDetailForNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApiFetch.mockResolvedValue({ transaction: { amount: 5, currency: 'USD' } })
  })

  it('seeds disk cache under ledger id and ETID alias before prefetch', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const cached: TransactionDetailResponse = {
      transaction: { amount: 1, currency: 'USD', transaction_id: etid },
    }
    mockReadCached.mockImplementation(async (id: string) => (id === etid ? cached : null))

    await warmTransactionDetailForNavigation(qc, scope, ledgerId, { aliasIds: [etid] })

    expect(mockReadCached).toHaveBeenCalledWith(etid)
    expect(mockReadCached).toHaveBeenCalledWith(ledgerId)
    expect(mockApiFetch).toHaveBeenCalled()
  })

  it('writes push snapshot to query cache and disk aliases', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockReadCached.mockResolvedValue(null)
    const snapshot = {
      transaction_id: etid,
      ledger_row_id: ledgerId,
      amount: 1,
      currency: 'USD',
      status: 'completed',
      transaction_type: 'send' as const,
      created_at: '2026-07-24T18:23:33.554Z',
    }

    await warmTransactionDetailForNavigation(qc, scope, ledgerId, {
      aliasIds: [etid],
      pushSnapshot: snapshot,
    })

    expect(mockWriteCached).toHaveBeenCalledWith(
      ledgerId,
      expect.objectContaining({ transaction: snapshot }),
    )
    expect(mockWriteCached).toHaveBeenCalledWith(
      etid,
      expect.objectContaining({ transaction: snapshot }),
    )
  })
})

describe('seedTransactionDetailFromDisk', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not read disk when query cache already has data', async () => {
    const qc = new QueryClient()
    const existing: TransactionDetailResponse = { transaction: { amount: 99 } }
    const key = qk.transactions.detail(scope, ledgerId)
    qc.setQueryData(key, existing)

    await seedTransactionDetailFromDisk(qc, scope, ledgerId)

    expect(qc.getQueryData(key)).toEqual(existing)
    expect(mockReadCached).not.toHaveBeenCalled()
  })
})
