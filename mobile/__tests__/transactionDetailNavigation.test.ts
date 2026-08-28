import { CommonActions } from '@react-navigation/native'
import {
  navigateBackFromTransactionDetail,
  navigateToTransactionDetailAfterPayIn,
} from '../src/navigation/transactionDetailNavigation'

describe('transactionDetailNavigation', () => {
  it('resets stack when opening transaction after receive pay-in', () => {
    const dispatch = jest.fn()
    navigateToTransactionDetailAfterPayIn({ goBack: jest.fn(), dispatch }, 'ETID12345678', 'ReceiveFlow')
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'TransactionDetails', params: { transactionId: 'ETID12345678', fromScreen: 'ReceiveFlow' } },
        ],
      }),
    )
  })

  it('resets stack when opening transaction after send pay-in', () => {
    const dispatch = jest.fn()
    navigateToTransactionDetailAfterPayIn({ goBack: jest.fn(), dispatch }, 'ETID12345678', 'SendFlow')
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'TransactionDetails', params: { transactionId: 'ETID12345678', fromScreen: 'SendFlow' } },
        ],
      }),
    )
  })

  it('returns to dashboard after pay-in transaction detail', () => {
    const dispatch = jest.fn()
    const goBack = jest.fn()
    navigateBackFromTransactionDetail(
      {
        goBack,
        dispatch,
        canGoBack: () => true,
        getState: () => ({
          index: 1,
          routes: [{ name: 'MainTabs' }, { name: 'TransactionDetails' }],
        }),
      },
      'ReceiveFlow',
    )
    expect(goBack).toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns to transactions list when opened from there', () => {
    const dispatch = jest.fn()
    const goBack = jest.fn()
    navigateBackFromTransactionDetail(
      {
        goBack,
        dispatch,
        canGoBack: () => true,
        getState: () => ({
          index: 1,
          routes: [{ name: 'MainTabs' }, { name: 'TransactionDetails' }],
        }),
      },
      'Transactions',
    )
    expect(goBack).toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('resets when the detail stack is deeper than MainTabs → detail', () => {
    const dispatch = jest.fn()
    navigateBackFromTransactionDetail(
      {
        goBack: jest.fn(),
        dispatch,
        canGoBack: () => true,
        getState: () => ({
          index: 2,
          routes: [
            { name: 'MainTabs' },
            { name: 'SelectRecentRecipient' },
            { name: 'TransactionDetails' },
          ],
        }),
      },
      'Dashboard',
    )
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Dashboard' } }],
      }),
    )
  })
})
