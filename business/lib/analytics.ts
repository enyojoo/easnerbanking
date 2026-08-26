"use client"

import {
  ANALYTICS_EVENTS,
  ANALYTICS_PLATFORM,
  ANALYTICS_SURFACE,
  invoiceProperties,
  kybProperties,
  sendFunnelProperties,
  type SendMethod,
} from "@easner/shared"
import { getPostHog } from "@/lib/posthog"

type Props = Record<string, unknown>

function withDefaults(properties?: Props): Props {
  return {
    platform: ANALYTICS_PLATFORM.businessWeb,
    environment: process.env.NODE_ENV,
    surface: ANALYTICS_SURFACE.operator,
    ...properties,
  }
}

function payerHost(): string | undefined {
  if (typeof window === "undefined") return undefined
  return window.location.hostname
}

function withPayerDefaults(properties?: Props): Props {
  return {
    platform: ANALYTICS_PLATFORM.payerWeb,
    environment: process.env.NODE_ENV,
    surface: ANALYTICS_SURFACE.payer,
    host: payerHost(),
    ...properties,
  }
}

function capture(event: string, properties?: Props) {
  const posthog = getPostHog()
  posthog.capture(event, withDefaults(properties))
}

function capturePayer(event: string, properties?: Props) {
  const posthog = getPostHog()
  posthog.capture(event, withPayerDefaults(properties))
}

export const analytics = {
  identify: (userId: string, properties?: Props) => {
    const posthog = getPostHog()
    posthog.identify(userId, withDefaults(properties))
  },

  group: (businessId: string, properties?: Props) => {
    const posthog = getPostHog()
    posthog.group("company", businessId, withDefaults(properties))
    posthog.register(withDefaults({ easner_business_id: businessId, ...properties }))
  },

  registerSuperProperties: (properties: Props) => {
    getPostHog().register(withDefaults(properties))
  },

  registerPayerWebContext: (properties?: Props) => {
    getPostHog().register(withPayerDefaults(properties))
  },

  reset: () => {
    const posthog = getPostHog()
    posthog.reset()
  },

  trackSignupPageViewed: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.signupPageViewed, properties)
  },

  trackSignUp: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.userSignedUp, { method, ...properties })
    capture(ANALYTICS_EVENTS.signupCompleted, { method, ...properties })
  },

  trackSignIn: (method: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.userSignedIn, { method, ...properties })
    capture(ANALYTICS_EVENTS.loginCompleted, { method, ...properties })
  },

  trackSignOut: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.userSignedOut, properties)
  },

  trackOnboardingBootstrapCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.onboardingBootstrapCompleted, properties)
  },

  trackSendStarted: (properties?: Props & Parameters<typeof sendFunnelProperties>[0]) => {
    capture(ANALYTICS_EVENTS.sendStarted, { ...sendFunnelProperties(properties ?? {}), ...properties })
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

  trackKybStarted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybStarted, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackKybStepCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybStepCompleted, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackKybSubmitted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybSubmitted, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackKybApproved: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybApproved, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackKybRejected: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybRejected, { ...kybProperties(properties ?? {}), ...properties })
  },

  trackStripeConnectCompleted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.stripeConnectCompleted, properties)
  },

  trackInvoiceDraftSaved: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.invoiceDraftSaved, { ...invoiceProperties(properties ?? {}), ...properties })
  },

  trackInvoiceIssued: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.invoiceIssued, { ...invoiceProperties(properties ?? {}), ...properties })
  },

  trackInvoiceSent: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.invoiceSent, { ...invoiceProperties(properties ?? {}), ...properties })
  },

  trackInvoicePaid: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.invoicePaid, { ...invoiceProperties(properties ?? {}), ...properties })
  },

  trackPaymentLinkCreated: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.paymentLinkCreated, properties)
  },

  trackCheckoutSiteLiveEnabled: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.checkoutSiteLiveEnabled, properties)
  },

  trackPayerInvoiceViewed: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerInvoiceViewed, properties)
  },

  trackPayerCheckoutStarted: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerCheckoutStarted, properties)
  },

  trackPayerPaymentSucceeded: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerPaymentSucceeded, properties)
  },

  trackPayerPaymentFailed: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerPaymentFailed, properties)
  },

  trackPayerStablecoinPaid: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerStablecoinPaid, properties)
  },

  trackPayerLinkViewed: (properties?: Props) => {
    capturePayer(ANALYTICS_EVENTS.payerLinkViewed, properties)
  },

  trackPayrollRunCreated: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.payrollRunCreated, properties)
  },

  trackPayrollRunSubmitted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.payrollRunSubmitted, properties)
  },

  trackPayrollRunExecuted: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.payrollRunExecuted, properties)
  },

  trackCardTabViewed: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.cardTabViewed, properties)
  },

  trackTransactionStarted: (properties: Props) => {
    capture(ANALYTICS_EVENTS.transactionStarted, properties)
  },

  trackTransactionCompleted: (properties: Props) => {
    capture(ANALYTICS_EVENTS.transactionCompleted, properties)
  },

  trackCurrencyConverted: (properties: Props) => {
    capture("currency_converted", properties)
  },

  trackRecipientAdded: (properties: Props) => {
    capture(ANALYTICS_EVENTS.recipientAdded, properties)
  },

  trackRecipientSelected: (properties: Props) => {
    capture(ANALYTICS_EVENTS.recipientSelected, properties)
  },

  trackFeatureUsed: (feature: string, properties?: Props) => {
    capture(ANALYTICS_EVENTS.featureUsed, { feature, ...properties })
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
    capture("account_closure_cancelled", properties)
  },

  trackKybStatusCorrected: (properties?: Props) => {
    capture(ANALYTICS_EVENTS.kybStatusCorrected, properties)
  },

  track: (event: string, properties?: Props) => {
    capture(event, properties)
  },
}

export type { SendMethod }
