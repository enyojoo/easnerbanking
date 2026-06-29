import PostHog from 'posthog-react-native'

let posthog: PostHog | null = null

export function initPostHog() {
  if (!posthog) {
    const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
    const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

    if (posthogKey && posthogHost) {
      posthog = new PostHog(posthogKey, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
      })

      if (__DEV__) {
        posthog.debug(true)
      }
    }
  }
  return posthog
}

export function getPostHog() {
  return posthog
}

export { posthog }
