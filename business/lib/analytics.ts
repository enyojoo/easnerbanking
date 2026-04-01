"use client"

import { getPostHog } from "@/lib/posthog"

type Props = Record<string, unknown>

function withDefaults(properties?: Props): Props {
  return {
    platform: "business_web",
    environment: process.env.NODE_ENV,
    ...properties,
  }
}

function capture(event: string, properties?: Props) {
  const posthog = getPostHog()
  posthog.capture(event, withDefaults(properties))
}

export const analytics = {
  identify: (userId: string, properties?: Props) => {
    const posthog = getPostHog()
    posthog.identify(userId, withDefaults(properties))
  },

  reset: () => {
    const posthog = getPostHog()
    posthog.reset()
  },

  trackSignUp: (method: string, properties?: Props) => {
    capture("user_signed_up", { method, ...properties })
  },

  trackSignIn: (method: string, properties?: Props) => {
    capture("user_signed_in", { method, ...properties })
  },

  trackSignOut: (properties?: Props) => {
    capture("user_signed_out", properties)
  },

  trackTransactionStarted: (properties: Props) => {
    capture("transaction_started", properties)
  },

  trackTransactionCompleted: (properties: Props) => {
    capture("transaction_completed", properties)
  },

  trackCurrencyConverted: (properties: Props) => {
    capture("currency_converted", properties)
  },

  trackRecipientAdded: (properties: Props) => {
    capture("recipient_added", properties)
  },

  trackRecipientSelected: (properties: Props) => {
    capture("recipient_selected", properties)
  },

  trackFeatureUsed: (feature: string, properties?: Props) => {
    capture("feature_used", { feature, ...properties })
  },

  trackError: (error: string, properties?: Props) => {
    capture("error_occurred", { error, ...properties })
  },

  track: (event: string, properties?: Props) => {
    capture(event, properties)
  },
}
