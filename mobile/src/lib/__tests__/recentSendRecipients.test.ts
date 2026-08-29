jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import { lastSentMapFromTransactions, sortRecipientsForSendHub } from '../recentSendRecipients'
import type { Recipient, Transaction } from '../../types'

function recipient(partial: Partial<Recipient> & { id: string; full_name: string }): Recipient {
  return {
    user_id: 'u1',
    account_number: '1',
    bank_name: 'Bank',
    currency: 'USD',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    transaction_id: 't1',
    user_id: 'u1',
    send_amount: 10,
    send_currency: 'USD',
    receive_amount: 10,
    receive_currency: 'USD',
    exchange_rate: 1,
    fee_amount: 0,
    fee_type: '',
    total_amount: 10,
    status: 'completed',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial,
  }
}

describe('lastSentMapFromTransactions', () => {
  const ama = recipient({ id: 'rec-ama', full_name: 'Ama Mensah', account_number: '123' })
  const koko = recipient({ id: 'rec-koko', full_name: 'Koko', account_number: '999' })

  it('reads recipient_id from ledger metadata', () => {
    const map = lastSentMapFromTransactions(
      [
        tx({
          id: 'newer',
          created_at: '2026-08-20T00:00:00.000Z',
          transaction_type: 'send',
          metadata: { recipient_id: 'rec-ama' },
        }),
        tx({
          id: 'older',
          created_at: '2026-08-10T00:00:00.000Z',
          transaction_type: 'send',
          metadata: { destination_ref: 'recipient:rec-koko' },
        }),
      ],
      [ama, koko],
      'u1',
    )
    expect(map['rec-ama']).toBeGreaterThan(map['rec-koko']!)
  })

  it('matches a saved recipient from snapshot when id is missing', () => {
    const map = lastSentMapFromTransactions(
      [
        tx({
          transaction_type: 'send',
          metadata: {
            recipient_snapshot: { full_name: 'Ama Mensah', account_number: '123' },
          },
        }),
      ],
      [ama, koko],
      'u1',
    )
    expect(map['rec-ama']).toBeGreaterThan(0)
  })

  it('ignores receive rows', () => {
    const map = lastSentMapFromTransactions(
      [
        tx({
          transaction_type: 'receive',
          recipient_id: 'rec-ama',
        }),
      ],
      [ama],
      'u1',
    )
    expect(map).toEqual({})
  })
})

describe('sortRecipientsForSendHub', () => {
  it('puts the last paid recipient first', () => {
    const ama = recipient({ id: 'rec-ama', full_name: 'Ama Mensah' })
    const koko = recipient({ id: 'rec-koko', full_name: 'Koko' })
    const { sorted } = sortRecipientsForSendHub([koko, ama], {
      'rec-ama': 200,
      'rec-koko': 100,
    })
    expect(sorted.map((r) => r.id)).toEqual(['rec-ama', 'rec-koko'])
  })
})
