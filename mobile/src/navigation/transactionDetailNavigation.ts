import { CommonActions } from '@react-navigation/native'

export type TransactionDetailFromScreen =
  | 'Dashboard'
  | 'Transactions'
  | 'YcPayIn'
  | 'SendFlow'
  | 'ReceiveFlow'
  | string

type NavigationLike = {
  goBack: () => void
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void
}

/** Leave YC pay-in complete — land on transaction detail with a clean stack. */
export function navigateToTransactionDetailAfterPayIn(
  navigation: NavigationLike,
  transactionId: string,
): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'MainTabs' },
        {
          name: 'TransactionDetails',
          params: { transactionId, fromScreen: 'YcPayIn' satisfies TransactionDetailFromScreen },
        },
      ],
    }),
  )
}

export function usesCustomTransactionDetailBack(fromScreen?: TransactionDetailFromScreen): boolean {
  return (
    fromScreen === 'Transactions' ||
    fromScreen === 'YcPayIn' ||
    fromScreen === 'SendFlow' ||
    fromScreen === 'ReceiveFlow' ||
    fromScreen === 'Dashboard'
  )
}

/** Back from transaction detail — never return to YC pay-in complete screens. */
export function navigateBackFromTransactionDetail(
  navigation: NavigationLike,
  fromScreen?: TransactionDetailFromScreen,
): void {
  if (fromScreen === 'Transactions') {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Transactions' } }],
      }),
    )
    return
  }
  if (
    fromScreen === 'YcPayIn' ||
    fromScreen === 'SendFlow' ||
    fromScreen === 'ReceiveFlow' ||
    fromScreen === 'Dashboard'
  ) {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Dashboard' } }],
      }),
    )
    return
  }
  navigation.goBack()
}
