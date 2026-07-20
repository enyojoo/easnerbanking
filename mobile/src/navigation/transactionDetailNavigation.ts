import { CommonActions } from '@react-navigation/native'

export type TransactionDetailFromScreen =
  | 'Dashboard'
  | 'Transactions'
  | 'SendFlow'
  | 'ReceiveFlow'
  | string

type NavigationLike = {
  goBack: () => void
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void
}

/** Leave pay-in review — land on transaction detail with a clean stack. */
export function navigateToTransactionDetailAfterPayIn(
  navigation: NavigationLike,
  transactionId: string,
  fromScreen: 'SendFlow' | 'ReceiveFlow' = 'ReceiveFlow',
): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'MainTabs' },
        {
          name: 'TransactionDetails',
          params: { transactionId, fromScreen },
        },
      ],
    }),
  )
}

export function usesCustomTransactionDetailBack(fromScreen?: TransactionDetailFromScreen): boolean {
  return (
    fromScreen === 'Transactions' ||
    fromScreen === 'SendFlow' ||
    fromScreen === 'ReceiveFlow' ||
    fromScreen === 'Dashboard'
  )
}

/** Back from transaction detail — never return to pay-in flow screens. */
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
