import { CommonActions } from '@react-navigation/native'

export type TransactionDetailFromScreen =
  | 'Dashboard'
  | 'Transactions'
  | 'SendFlow'
  | 'ReceiveFlow'
  | string

type NavigationStateLike = {
  index: number
  routes: Array<{ name: string }>
}

type NavigationLike = {
  goBack: () => void
  canGoBack?: () => boolean
  getState?: () => NavigationStateLike
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void
}

/** MainTabs → detail only — safe to pop with the normal stack close animation. */
function canPopTransactionDetailFromMainTabs(navigation: NavigationLike): boolean {
  if (!navigation.canGoBack?.()) return false
  const state = navigation.getState?.()
  if (!state) return false
  const { routes, index } = state
  return (
    routes.length === 2 &&
    index === 1 &&
    routes[0]?.name === 'MainTabs' &&
    routes[index]?.name === 'TransactionDetails'
  )
}

/** Leave pay-in review – land on transaction detail with a clean stack. */
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

/** Back from transaction detail – never return to pay-in flow screens. */
export function navigateBackFromTransactionDetail(
  navigation: NavigationLike,
  fromScreen?: TransactionDetailFromScreen,
): void {
  // Prefer animated pop when the stack is simply MainTabs → TransactionDetails.
  // Resetting here remounts tabs and causes a visible flicker on Dashboard / Activity.
  if (canPopTransactionDetailFromMainTabs(navigation)) {
    navigation.goBack()
    return
  }

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
