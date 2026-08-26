import { InteractionManager, Platform } from 'react-native'
import PostHog, { type PostHogOptions } from 'posthog-react-native'
import { ANALYTICS_PLATFORM, consumerPlatformFromOs } from '@easner/shared'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

export const posthogOptions: PostHogOptions | undefined =
  posthogKey && posthogHost
    ? {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        enableSessionReplay: true,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          captureNetworkTelemetry: true,
        },
      }
    : undefined

let posthog: PostHog | null = null

function createPostHogClient(): PostHog | null {
  if (!posthogKey || !posthogHost || !posthogOptions) return null
  if (!posthog) {
    posthog = new PostHog(posthogKey, posthogOptions)
    if (__DEV__) {
      posthog.debug(true)
    }
    posthog.register({
      platform: consumerPlatformFromOs(Platform.OS),
      os: Platform.OS,
      environment: __DEV__ ? 'development' : 'production',
    })
  }
  return posthog
}

export function getPostHog(): PostHog | null {
  return createPostHogClient()
}

let bootInitScheduled = false

export function schedulePostHogBootInit(): void {
  if (bootInitScheduled || posthog) return
  bootInitScheduled = true
  InteractionManager.runAfterInteractions(() => {
    createPostHogClient()
  })
}

export function initPostHog(): PostHog | null {
  return createPostHogClient()
}

export { posthog }
