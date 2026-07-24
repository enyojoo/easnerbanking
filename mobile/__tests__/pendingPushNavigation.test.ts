jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  peekPendingPushPayload,
  stashPendingPushFromNotificationData,
} from '../src/lib/pendingPushNavigation'

describe('pendingPushNavigation stash', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it('stores initialTransaction parsed from push snapshot', async () => {
    await stashPendingPushFromNotificationData({
      type: 'transaction_settled',
      transactionId: '6ec5b65f-2d65-4208-999f-86e3c4e67c35',
      easnerTransactionId: 'ETID88873887',
      amount: 1,
      currency: 'USD',
      direction: 'out',
      status: 'settled',
      category: 'Easetag Send',
      displayTitle: 'Sent to @channelle',
    })

    const pending = await peekPendingPushPayload()
    expect(pending).toMatchObject({
      screen: 'TransactionDetails',
      transactionId: '6ec5b65f-2d65-4208-999f-86e3c4e67c35',
    })
    if (pending?.screen === 'TransactionDetails') {
      expect(pending.initialTransaction).toMatchObject({
        ledger_row_id: '6ec5b65f-2d65-4208-999f-86e3c4e67c35',
        transaction_id: 'ETID88873887',
        transaction_type: 'send',
        display_hero_title: 'Sent to @channelle',
      })
    }
  })
})
