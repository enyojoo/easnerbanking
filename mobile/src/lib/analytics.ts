import { Platform } from 'react-native'
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PLATFORM,
  consumerPlatformFromOs,
  invoiceProperties,
  kybProperties,
  sendFunnelProperties,
} from '@easner/shared'
import { getPostHog } from './posthog'

type Props = Record<string, unknown>
type ScreenTrackingMode = 'manual' | 'auto'

let screenTrackingMode: ScreenTrackingMode = 'manual'

const withDefaults = (properties?: Props): Props => ({
  platform: consumerPlatformFromOs(Platform.OS),
  os: Platform.OS,
  environment: __DEV__ ? 'development' : 'production',
  ...properties,
})

const capture = (event: string, properties?: Props) => {
  const posthog = getPostHog()
  if (!posthog) return
  posthog.capture(event, withDefaults(properties))
}

const captureScreen = (screenName: string, properties?: Props) => {
  const posthog = getPostHog()
  if (!posthog) return
  const props = withDefaults(properties)
  if (typeof posthog.screen === 'function') {
    posthog.screen(screenName, props)
    return
  }
  posthog.capture('$screen', { $screen_name: screenName, ...props })
}

export const analytics = {
  setScreenTrackingMode: (mode: ScreenTrackingMode) => {
    screenTrackingMode = mode
  },

  identify: (userId: string, properties?: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.identify(userId, withDefaults(properties))
  },

  group: (groupType: string, groupKey: string, properties?: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.group(groupType, groupKey, withDefaults(properties))
  },

  registerSuperProperties: (properties: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.register(withDefaults(properties))
  },

  trackSignUp: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.userSignedUp, { method, ...properties })
    capture(ANALYTICS_EVENTS.signupCompleted, { method, ...properties })
  },

  trackSignIn: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.userSignedIn, { method, ...properties })
    capture(ANALYTICS_EVENTS.loginCompleted, { method, ...properties })
  },

  trackSignOut: () => {
    capture(ANALYTICS_EVENTS.userSignedOut)
    getPostHog()?.reset()
  },

  trackOnboardingStepViewed: (step: number | string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.onboardingStepViewed, { step, ...properties })
  },

  trackOnboardingCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.onboardingCompleted, properties)
  },

  trackSendStarted: (properties?: Props & Parameters<typeof sendFunnelProperties>[0]) => {
    capture(ANALYTICS_EVENTS.sendStarted, { ...sendFunnelProperties(properties ?? {}), ...properties })
    capture(ANALYTICS_EVENTS.transactionStarted, { ...sendFunnelProperties(properties ?? {}), ...properties })
  },

  trackSendSubmitted: (properties?: Props & Parameters<typeof sendFunnelProperties>[0]) => {
    capture(ANALYTICS_EVENTS.sendSubmitted, { ...sendFunnelProperties(properties ?? {}), ...properties })
  },

  trackSendCompleted: (properties?: Props & Parameters<typeof sendFunnelProperties>[0]) => {
    capture(ANALYTICS_EVENTS.sendCompleted, { ...sendFunnelProperties(properties ?? {}), ...properties })
    capture(ANALYTICS_EVENTS.transactionCompleted, { ...sendFunnelProperties(properties ?? {}), ...properties })
  },

  trackSendFailed: (properties?: Props & Parameters<typeof sendFunnelProperties>[0]) => {
    capture(ANALYTICS_EVENTS.sendFailed, { ...sendFunnelProperties(properties ?? {}), ...properties })
  },

  trackReceiveViewed: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.receiveViewed, properties)
  },

  trackExpressDepositStarted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.expressDepositStarted, properties)
  },

  trackExpressDepositCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.expressDepositCompleted, properties)
  },

  trackKycStarted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kycStarted, properties)
  },

  trackKycSubmitted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kycSubmitted, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackKycCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kycCompleted, properties)
  },

  trackTransactionStarted: (properties: Props) => {
    capture(ANALYTICS_EVENTS.transactionStarted, properties)
  },

  trackTransactionCompleted: (properties: Props) => {
    capture(ANALYTICS_EVENTS.transactionCompleted, properties)
  },

  trackCurrencyConverted: (properties: Props) => {
    capture('currency_converted', properties)
  },

  trackCurrencyConversion: (properties: Props) => {
    capture('currency_converted', properties)
  },

  trackRecipientAdded: (properties: Props) => {
    capture(ANALYTICS_EVENTS.recipientAdded, properties)
  },

  trackRecipientEdited: (properties: Props) => {
    capture(ANALYTICS_EVENTS.recipientEdited, properties)
  },

  trackRecipientSelected: (properties: Props) => {
    capture(ANALYTICS_EVENTS.recipientSelected, properties)
  },

  trackScreenView: (screenName: string, properties?: Props) => {
    if (screenTrackingMode === 'auto') return
    captureScreen(screenName, properties)
  },

  trackSupportLiveChatOpened: () => {
    capture(ANALYTICS_EVENTS.supportLiveChatOpened)
  },

  trackNavigationScreenView: (screenName: string, properties?: Props) => {
    captureScreen(screenName, properties)
  },

  trackWebPageView: (href: string, referrer: string, properties?: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.capture('$pageview', withDefaults({ $current_url: href, $referrer: referrer || '$direct', ...properties }))
  },

  trackFeatureUsed: (featureName: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.featureUsed, { feature: featureName, ...properties })
  },

  trackError: (error: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.errorOccurred, { error, ...properties })
  },

  trackSignInFailed: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.signInFailed, { method, ...properties })
  },

  trackSignInCancelled: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.signInCancelled, { method, ...properties })
  },

  trackAccountClosureCancelled: (properties?: Props) => {
    capture('account_closure_cancelled', properties)
  },

  trackPushOpened: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.pushOpened, properties)
  },

  trackDeepLinkOpened: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.deepLinkOpened, properties)
  },

  trackPayrollDeepLinkOpened: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.payrollDeepLinkOpened, properties)
  },

  trackPinSetupCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.pinSetupCompleted, properties)
  },

  trackAppLocked: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.appLocked, properties)
  },

  track: (event: string, properties?: Props) => {
    capture(event, properties)
  },

  trackAppOpened: () => {
    capture('app_opened')
  },

  trackAppBackgrounded: () => {
    capture('app_backgrounded')
  },

  setUserProperties: (properties: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.setPersonProperties(withDefaults(properties))
  },

  setGroupProperties: (groupType: string, groupKey: string, properties: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.group(groupType, groupKey, withDefaults(properties))
  },

  reset: () => {
    getPostHog()?.reset()
  },
}

export { ANALYTICS_PLATFORM }
