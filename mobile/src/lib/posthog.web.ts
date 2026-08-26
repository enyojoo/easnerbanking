import posthog from 'posthog-js'
import {
  ANALYTICS_PLATFORM,
  cleanBrowserAttributionUrl,
  shouldIdentifyCrossDomainId,
} from '@easner/shared'

const DEFAULT_API_HOST = 'https://us.i.posthog.com'

type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (userId: string, properties?: Record<string, unknown>) => void
  reset: () => void
  screen: (screenName: string, properties?: Record<string, unknown>) => void
  group: (groupType: string, groupKey: string, properties?: Record<string, unknown>) => void
  setPersonProperties: (properties: Record<string, unknown>) => void
  register: (properties: Record<string, unknown>) => void
}

let initStarted = false
let disabled = false

function noopClient(): AnalyticsClient {
  return {
    capture: () => {},
    identify: () => {},
    reset: () => {},
    screen: () => {},
    group: () => {},
    setPersonProperties: () => {},
    register: () => {},
  }
}

export function initPostHog(): AnalyticsClient {
  if (typeof window === 'undefined') return noopClient()
  if (disabled) return noopClient()
  if (initStarted) return posthog as unknown as AnalyticsClient

  const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
  if (!posthogKey) {
    disabled = true
    if (process.env.NODE_ENV !== 'production') {
      console.warn('PostHog not initialized: missing EXPO_PUBLIC_POSTHOG_KEY')
    }
    return noopClient()
  }

  initStarted = true
  const apiHost = process.env.EXPO_PUBLIC_POSTHOG_HOST || DEFAULT_API_HOST

  posthog.init(posthogKey, {
    api_host: apiHost,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    cross_subdomain_cookie: true,
    secure_cookie: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask], input, textarea',
    },
    loaded: (ph) => {
      const params = new URLSearchParams(window.location.search)
      const crossDomainId = params.get('__ph_id')
      if (shouldIdentifyCrossDomainId(crossDomainId, ph.get_property('$user_id'))) {
        ph.identify(crossDomainId!)
      }
      cleanBrowserAttributionUrl()
    },
  })

  posthog.register({
    platform: ANALYTICS_PLATFORM.consumerWeb,
    os: 'web',
    environment: __DEV__ ? 'development' : 'production',
  })

  return posthog as unknown as AnalyticsClient
}

export function getPostHog(): AnalyticsClient | null {
  if (typeof window === 'undefined' || disabled) return null
  if (!initStarted) initPostHog()
  if (disabled) return null
  return posthog as unknown as AnalyticsClient
}

export function schedulePostHogBootInit(): void {
  initPostHog()
}

if (typeof window !== 'undefined') {
  initPostHog()
}

export { posthog }
