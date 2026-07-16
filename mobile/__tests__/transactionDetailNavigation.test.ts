import { CommonActions } from '@react-navigation/native'
import {
  navigateBackFromTransactionDetail,
  navigateToTransactionDetailAfterPayIn,
} from '../src/navigation/transactionDetailNavigation'

describe('transactionDetailNavigation', () => {
  it('resets stack when opening transaction after YC pay-in', () => {
    const dispatch = jest.fn()
    navigateToTransactionDetailAfterPayIn({ goBack: jest.fn(), dispatch }, 'ETID12345678')
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'TransactionDetails', params: { transactionId: 'ETID12345678', fromScreen: 'YcPayIn' } },
        ],
      }),
    )
  })

  it('returns to dashboard after YC pay-in transaction detail', () => {
    const dispatch = jest.fn()
    navigateBackFromTransactionDetail({ goBack: jest.fn(), dispatch }, 'YcPayIn')
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Dashboard' } }],
      }),
    )
  })

  it('returns to transactions list when opened from there', () => {
    const dispatch = jest.fn()
    navigateBackFromTransactionDetail({ goBack: jest.fn(), dispatch }, 'Transactions')
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Transactions' } }],
      }),
    )
  })
})
