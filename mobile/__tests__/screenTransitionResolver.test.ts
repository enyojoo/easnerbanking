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
  it('keeps animated push for all hub routes (instant disabled for iOS stability)', () => {
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SendAmount',
        previousRouteName: 'SelectRecentRecipient',
      }),
    ).toBe(false)
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SelectRecentRecipient',
        previousRouteName: 'MainTabs',
      }),
    ).toBe(false)
    expect(
      shouldUseFlowHubInstantTransition({
        routeName: 'SendAmount',
        routeParams: { fromSelectRecentRecipient: true },
      }),
    ).toBe(false)
  })

  it('receive local rail no longer shares hub group with amount', () => {
    expect(routesShareHubGroup('ReceiveLocalRail', 'ReceiveLocalAmount')).toBe(false)
  })
})

describe('resolveGestureEnabled', () => {
  it('disables gesture on MainTabs and auth gates', () => {
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
        routeName: 'PinSetupGate',
        entry: { intent: 'authGate', blockGesture: true },
        platform: 'ios',
      }),
    ).toBe(false)
  })

  it('enables gesture on flow hubs for Android', () => {
    setPlatform('android')
    expect(
      resolveGestureEnabled({
        routeName: 'SendAmount',
        entry: { intent: 'flowHub', hubGroup: 'sendHub' },
        platform: 'android',
      }),
    ).toBe(true)
  })

  it('enables gesture on all flow steps for Android', () => {
    setPlatform('android')
    expect(
      resolveGestureEnabled({
        routeName: 'SendCrossBorderMomoSetup',
        entry: { intent: 'flowStep' },
        platform: 'android',
      }),
    ).toBe(true)
    expect(
      resolveGestureEnabled({
        routeName: 'SendConfirm',
        entry: { intent: 'flowStep', flowStepTerminal: true },
        platform: 'android',
      }),
    ).toBe(true)
  })

  it('enables gesture on stack entry screens for Android', () => {
    setPlatform('android')
    expect(
      resolveGestureEnabled({
        routeName: 'ReceiveMoney',
        entry: { intent: 'stackEntry' },
        platform: 'android',
      }),
    ).toBe(true)
    expect(
      resolveGestureEnabled({
        routeName: 'Profile',
        entry: { intent: 'stackEntry' },
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
})

describe('resolveScreenTransitionOptions', () => {
  it('uses horizontal motion for adjacent send hub screens on native', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'SendAmount',
      previousRouteName: 'SelectRecentRecipient',
    })
    expect(options.gestureEnabled).toBe(true)
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })

  it('uses horizontal motion for dashboard entry into send hub on native', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'SelectRecentRecipient',
      previousRouteName: 'MainTabs',
    })
    expect(options.gestureEnabled).toBe(true)
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })

  it('uses horizontal motion for tab entry on Android with swipe enabled', () => {
    setPlatform('android')
    const options = resolveScreenTransitionOptions({
      routeName: 'Profile',
      previousRouteName: 'MainTabs',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
    expect(options.gestureEnabled).toBe(true)
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

  it('presents AddRecipientType as a transparent sheet over the list', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'AddRecipientType',
      previousRouteName: 'SelectRecentRecipient',
    })
    expect(options.presentation).toBe('transparentModal')
    expect(options.gestureDirection).toBe('vertical')
    expect(options.gestureEnabled).toBe(true)
    expect(options.gestureResponseDistance).toBe(2000)
    expect(options.cardStyleInterpolator).toBeDefined()
  })

  it('detaches the type sheet while a recipient form is open', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'AddBankRecipient',
      previousRouteName: 'AddRecipientType',
    })
    expect(options.detachPreviousScreen).toBe(true)
    expect(options.gestureEnabled).toBe(true)
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

  it('uses horizontal motion for send hub on web sidebar shell', () => {
    setPlatform('web')
    const options = resolveScreenTransitionOptions({
      routeName: 'SendAmount',
      previousRouteName: 'SelectRecentRecipient',
      showSidebarShell: true,
      layoutMode: 'desktop',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })

  it('MainTabs disables gesture', () => {
    setPlatform('ios')
    const options = resolveScreenTransitionOptions({
      routeName: 'MainTabs',
    })
    expect(options.gestureEnabled).toBe(false)
  })

  it('uses instant preset for auth gate stack roots on native', () => {
    setPlatform('android')
    const options = resolveScreenTransitionOptions({
      routeName: 'PinEntryGate',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(false)
  })

  it('uses horizontal motion when pushing auth screens within AuthStack', () => {
    setPlatform('android')
    const options = resolveScreenTransitionOptions({
      routeName: 'ForgotPassword',
      previousRouteName: 'Auth',
    })
    expect(presetHasStackMotion(options as Record<string, unknown>)).toBe(true)
  })
})
