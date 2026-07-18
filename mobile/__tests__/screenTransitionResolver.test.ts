import { Platform } from 'react-native'
import {
  resolveGestureEnabled,
  routesShareHubGroup,
  shouldUseFlowHubInstantTransition,
} from '../src/navigation/screenTransitionRegistry'
import {
  presetHasStackMotion,
  resolveScreenTransitionOptions,
} from '../src/navigation/resolveScreenTransitionOptions'

const originalOS = Platform.OS

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os })
}

afterEach(() => {
  setPlatform(originalOS)
})

describe('shouldUseFlowHubInstantTransition', () => {
  it('instant between send hub adjacent routes', () => {
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SendAmount',
        previousRouteName: 'SelectRecentRecipient',
      }),
    ).toBe(true)
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SelectRecipient',
        previousRouteName: 'SendAmount',
      }),
    ).toBe(true)
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SelectRecentRecipient',
        previousRouteName: 'SendAmount',
      }),
    ).toBe(true)
  })

  it('instant into SendAmount from hub forward params', () => {
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SendAmount',
        routeParams: { fromSelectRecentRecipient: true },
      }),
    ).toBe(true)
  })

  it('not instant when entering send from tabs', () => {
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SendAmount',
        previousRouteName: 'MainTabs',
      }),
    ).toBe(false)
  })

  it('instant between receive local hub routes', () => {
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'ReceiveLocalAmount',
        previousRouteName: 'ReceiveLocalRail',
      }),
    ).toBe(true)
    expect(routesShareHubGroup('ReceiveLocalRail', 'ReceiveLocalAmount')).toBe(true)
  })
})

describe('resolveGestureEnabled', () => {
  it('disables gesture on MainTabs and flow hubs', () => {
    setPlatform('android')
    expect(
      resolveGestureEnabled({
        routeName: 'MainTabs',
        entry: { intent: 'tabRoot', blockGesture: true },
        platform: 'android',
      }),
    ).toBe(false)
    expect(
      resolveGestureEnabled({
        routeName: 'SendAmount',
        entry: { intent: 'flowHub', hubGroup: 'sendHub' },
        platform: 'android',
      }),
    ).toBe(false)
  })

  it('enables gesture on Android terminal flow steps', () => {
    setPlatform('android')
    expect(
      resolveGestureEnabled({
        routeName: 'SendConfirm',
        entry: { intent: 'flowStep', flowStepTerminal: true },
        platform: 'android',
      }),
    ).toBe(true)
  })

  it('enables gesture on detail screens for both platforms', () => {
    expect(
      resolveGestureEnabled({
        routeName: 'TransactionDetails',
        entry: { intent: 'detail' },
        platform: 'android',
      }),
    ).toBe(true)
    expect(
      resolveGestureEnabled({
        routeName: 'TransactionDetails',
        entry: { intent: 'detail' },
        platform: 'ios',
      }),
    ).toBe(true)
  })

  it('blocks gesture on mandatory auth gates', () => {
    expect(
      resolveGestureEnabled({
        routeName: 'PinSetupGate',
        entry: { intent: 'authGate', blockGesture: true },
        platform: 'ios',
      }),
    ).toBe(false)
  })
})

describe('resolveScreenTransitionOptions', () => {
  it('uses instant preset for send hub pairs on native', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'SendAmount',
      previousRouteName: 'SelectRecentRecipient',
    })
    expect(options.gestureEnabled).toBe(false)
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(false)
  })

  it('uses horizontal motion for tab entry on Android', () => {
    setPlatform('android')
    const options = resolveScreenTransitionOptions({
      routeName: 'Profile',
      previousRouteName: 'MainTabs',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
    expect(options.gestureEnabled).toBe(false)
  })

  it('uses modal bottom interpolator for ScanWalletAddress', () => {
    setPlatform('android')
    const options = resolveScreenTransitionOptions({
      routeName: 'ScanWalletAddress',
      previousRouteName: 'SelectRecipient',
    })
    expect(options.gestureEnabled).toBe(false)
    expect(options.cardStyleInterpolator).toBeDefined()
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })

  it('uses desktop web fade when sidebar shell active', () => {
    setPlatform('web')
    const options = resolveScreenTransitionOptions({
      routeName: 'Profile',
      previousRouteName: 'MainTabs',
      showSidebarShell: true,
      layoutMode: 'desktop',
    })
    expect(options.cardStyleInterpolator).toBeDefined()
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })

  it('keeps hub instant on web sidebar shell', () => {
    setPlatform('web')
    const options = resolveScreenTransitionOptions({
      routeName: 'SendAmount',
      previousRouteName: 'SelectRecentRecipient',
      showSidebarShell: true,
      layoutMode: 'desktop',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(false)
  })

  it('MainTabs disables gesture', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'MainTabs',
    })
    expect(options.gestureEnabled).toBe(false)
  })
})
