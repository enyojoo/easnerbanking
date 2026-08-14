import { getPostHog } from './posthog'

type Props = Record<string, any>
type ScreenTrackingMode = 'manual' | 'auto'

let screenTrackingMode: ScreenTrackingMode = 'manual'

const withDefaults = (properties?: Props): Props => ({
  platform: 'mobile',
  environment: __DEV__ ? 'development' : 'production',
  ...properties,
})

const capture = (event: string, properties?: Props) => {
  const posthog = getPostHog()
  if (!posthog) return
  posthog.capture(event, withDefaults(properties))
}

export const analytics = {
  setScreenTrackingMode: (mode: ScreenTrackingMode) => {
    screenTrackingMode = mode
  },

  // User identification and authentication
  identify: (userId: string, properties?: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.identify(userId, withDefaults(properties))
  },

  // Track user registration
  trackSignUp: (method: string, properties?: Props) => {
    capture('user_signed_up', { method, ...properties })
  },

  // Track user login
  trackSignIn: (method: string, properties?: Props) => {
    capture('user_signed_in', { method, ...properties })
  },

  // Track user logout
  trackSignOut: () => {
    capture('user_signed_out')
    getPostHog()?.reset()
  },

  // Transaction tracking
  trackTransactionStarted: (properties: {
    sendCurrency: string
    receiveCurrency: string
    sendAmount: number
    receiveAmount: number
    exchangeRate: number
    fee: number
  }) => {
    capture('transaction_started', properties)
  },

  trackTransactionCompleted: (properties: {
    transactionId: string
    sendCurrency: string
    receiveCurrency: string
    sendAmount: number
    receiveAmount: number
    exchangeRate: number
    fee: number
    totalAmount: number
  }) => {
    capture('transaction_completed', properties)
  },

  // Currency converter usage
  trackCurrencyConverted: (properties: {
    fromCurrency: string
    toCurrency: string
    amount: number
    convertedAmount: number
    exchangeRate: number
  }) => {
    capture('currency_converted', properties)
  },

  trackCurrencyConversion: (properties: {
    fromCurrency: string
    toCurrency: string
    amount: number
    convertedAmount: number
    exchangeRate: number
  }) => {
    capture('currency_converted', properties)
  },

  // Recipient management
  trackRecipientAdded: (properties: {
    recipientId: string
    bankName: string
    country: string
  }) => {
    capture('recipient_added', properties)
  },

  trackRecipientEdited: (properties: {
    recipientId: string
    bankName: string
    country: string
  }) => {
    capture('recipient_edited', properties)
  },

  trackRecipientSelected: (properties: {
    recipientId: string
    recipientType?: string
    country?: string
  }) => {
    capture('recipient_selected', properties)
  },

  // Screen navigation
  trackScreenView: (screenName: string, properties?: Props) => {
    if (screenTrackingMode === 'auto') return
    const posthog = getPostHog()
    if (!posthog) return
    posthog.screen(screenName, withDefaults(properties))
  },

  trackSupportLiveChatOpened: () => {
    capture('support_live_chat_opened')
  },

  trackNavigationScreenView: (screenName: string, properties?: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.screen(screenName, withDefaults(properties))
  },

  // Feature usage
  trackFeatureUsed: (featureName: string, properties?: Props) => {
    capture('feature_used', { feature: featureName, ...properties })
  },

  // Error tracking
  trackError: (error: string, properties?: Props) => {
    capture('error_occurred', { error, ...properties })
  },

  trackSignInCancelled: (method: string, properties?: Props) => {
    capture('sign_in_cancelled', { method, ...properties })
  },

  trackAccountClosureCancelled: (properties?: Props) => {
    capture('account_closure_cancelled', properties)
  },

  track: (event: string, properties?: Props) => {
    capture(event, properties)
  },

  // App lifecycle
  trackAppOpened: () => {
    capture('app_opened')
  },

  trackAppBackgrounded: () => {
    capture('app_backgrounded')
  },

  // User properties
  setUserProperties: (properties: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.setPersonProperties(withDefaults(properties))
  },

  // Group properties (for organization-level analytics)
  setGroupProperties: (groupType: string, groupKey: string, properties: Props) => {
    const posthog = getPostHog()
    if (!posthog) return
    posthog.group(groupType, groupKey, withDefaults(properties))
  },

  reset: () => {
    getPostHog()?.reset()
  },
}
