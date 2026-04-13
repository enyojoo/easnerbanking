import { StackActions } from '@react-navigation/native'

type StackRoute = { name: string; params?: Record<string, unknown> }

type StackNavigationLike = {
  getState: () => { index: number; routes: StackRoute[] }
  dispatch: (action: unknown) => void
  navigate: (...args: unknown[]) => void
}

/**
 * Open the send recipient hub without stacking another copy of the hub.
 * When the user taps "Change" on Send Amount repeatedly, `navigate('SelectRecentRecipient')`
 * can push duplicate hub/send pairs; this collapses back to the first hub in the flow and merges params.
 */
export function navigateToSendRecipientHub(
  navigation: StackNavigationLike,
  params: Record<string, unknown>
): void {
  const state = navigation.getState()
  const routes = state?.routes
  if (!routes?.length) {
    navigation.navigate('SelectRecentRecipient' as never, params as never)
    return
  }

  const idx = state.index
  const top = routes[idx]
  if (top?.name !== 'SendAmount') {
    navigation.navigate('SelectRecentRecipient' as never, params as never)
    return
  }

  const mainTabsIdx = routes.findIndex((r) => r.name === 'MainTabs')

  let hubIdx = -1
  if (mainTabsIdx >= 0) {
    for (let i = mainTabsIdx + 1; i < routes.length; i++) {
      if (routes[i].name === 'SelectRecentRecipient') {
        hubIdx = i
        break
      }
    }
  } else {
    hubIdx = routes.findIndex((r) => r.name === 'SelectRecentRecipient')
  }

  if (hubIdx < 0 || hubIdx >= idx) {
    navigation.navigate('SelectRecentRecipient' as never, params as never)
    return
  }

  const hubRoute = routes[hubIdx]
  const prevParams =
    typeof hubRoute.params === 'object' && hubRoute.params !== null ? hubRoute.params : {}
  const mergedParams = { ...prevParams, ...params }

  const popCount = idx - hubIdx
  navigation.dispatch(StackActions.pop(popCount))
  navigation.navigate({
    name: 'SelectRecentRecipient',
    params: mergedParams,
    merge: true,
  } as never)
}
