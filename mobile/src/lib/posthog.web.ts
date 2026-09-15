import posthog from 'posthog-js'
import { consumerPlatformFromOs } from '@easner/shared'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

type PostHogWebClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (userId: string, properties?: Record<string, unknown>) => void
  reset: () => void
  screen: (screenName: string, properties?: Record<string, unknown>) => void
  setPersonProperties: (properties: Record<string, unknown>) => void
  group: (groupType: string, groupKey: string, properties?: Record<string, unknown>) => void
  register: (properties: Record<string, unknown>) => void
}

let client: PostHogWebClient | null = null

function createPostHogClient(): PostHogWebClient | null {
  if (typeof window === 'undefined') return null
  if (!posthogKey || !posthogHost) return null
  if (client) return client

  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask], input, textarea',
    },
    loaded: (ph) => {
      ph.register({
        platform: consumerPlatformFromOs('web'),
        environment: __DEV__ ? 'development' : 'production',
      })
      if (__DEV__) {
        ph.debug(true)
      }
    },
  })

  client = {
    capture: (event, properties) => {
      posthog.capture(event, properties)
    },
    identify: (userId, properties) => {
      posthog.identify(userId, properties)
    },
    reset: () => {
      posthog.reset()
    },
    screen: (screenName, properties) => {
      posthog.capture('$screen', { $screen_name: screenName, ...properties })
    },
    setPersonProperties: (properties) => {
      posthog.setPersonProperties(properties)
    },
    group: (groupType, groupKey, properties) => {
      posthog.group(groupType, groupKey, properties)
    },
    register: (properties) => {
      posthog.register(properties)
    },
  }

  return client
}

export const posthogClient = createPostHogClient()

export function getPostHog() {
  return posthogClient ?? createPostHogClient()
}

export { posthog }
