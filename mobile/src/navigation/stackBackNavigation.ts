import { CommonActions, StackActions } from '@react-navigation/native'

export type MainTabName = 'Dashboard' | 'Card' | 'Transactions' | 'More'

type StackRoute = { name: string; params?: Record<string, unknown> }

type StackNavigationLike = {
  canGoBack: () => boolean
  goBack: () => void
  getState: () => { index: number; routes: StackRoute[] }
  dispatch: (action: unknown) => void
  navigate: (...args: unknown[]) => void
}

/** True when the top two stack routes share the same name (duplicate push). */
export function hasDuplicateStackTop(state: { index: number; routes: StackRoute[] }): boolean {
  const idx = state.index
  if (idx < 1) return false
  const current = state.routes[idx]?.name
  const previous = state.routes[idx - 1]?.name
  return Boolean(current && previous && current === previous)
}

/** Reset stack to MainTabs on a specific tab – clears send/receive loops. */
export function exitToMainTabs(
  navigation: StackNavigationLike,
  tab: MainTabName = 'Dashboard',
): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: tab } }],
    }),
  )
}

/** Leave Express setup after it is ready – Add money cannot sit on top of setup. */
export function exitExpressSetupToAddMoney(navigation: { dispatch: (action: unknown) => void }): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'MainTabs', params: { screen: 'Dashboard' } },
        { name: 'ReceiveMoney' },
      ],
    }),
  )
}

/**
 * Safe stack back – pops duplicate consecutive routes, then goBack, else exits to MainTabs.
 */
export function navigateStackBack(
  navigation: StackNavigationLike,
  options?: { fallbackTab?: MainTabName },
): void {
  const state = navigation.getState()

  if (hasDuplicateStackTop(state)) {
    navigation.dispatch(StackActions.pop(1))
    return
  }

  if (navigation.canGoBack()) {
    navigation.goBack()
    return
  }

  exitToMainTabs(navigation, options?.fallbackTab ?? 'Dashboard')
}

/** Leave the send flow from the recipient hub – always land on Dashboard tabs. */
export function exitSendFlowFromHub(navigation: StackNavigationLike): void {
  const state = navigation.getState()
  const idx = state.index
  const current = state.routes[idx]?.name

  if (current === 'SelectRecentRecipient' || current === 'SelectRecipient') {
    const mainTabsIdx = state.routes.findIndex((r) => r.name === 'MainTabs')
    if (mainTabsIdx >= 0 && idx > mainTabsIdx) {
      exitToMainTabs(navigation, 'Dashboard')
      return
    }
  }

  navigateStackBack(navigation, { fallbackTab: 'Dashboard' })
}

/** Pop to MainTabs without clearing tab param – for settings opened from More. */
export function popToMainTabs(
  navigation: StackNavigationLike,
  tab: MainTabName = 'More',
): void {
  const state = navigation.getState()
  const mainTabsIdx = state.routes.findIndex((r) => r.name === 'MainTabs')
  if (mainTabsIdx >= 0 && state.index > mainTabsIdx) {
    const popCount = state.index - mainTabsIdx
    navigation.dispatch(StackActions.pop(popCount))
    return
  }
  exitToMainTabs(navigation, tab)
}
