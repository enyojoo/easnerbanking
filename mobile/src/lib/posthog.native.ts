import { Platform } from 'react-native'
import PostHog, { type PostHogOptions } from 'posthog-react-native'
import { consumerPlatformFromOs } from '@easner/shared'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

/**
 * Native PostHog — matches build 206: session replay on iOS and Android.
 */
export const posthogOptions: PostHogOptions | undefined =
  posthogKey && posthogHost
    ? {
        host: posthogHost,
        captureAppLifecycleEvents: Platform.OS !== 'web',
        enableSessionReplay: Platform.OS !== 'web',
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

/** Eager init so session replay can fetch remote config before the first screen (build 206). */
export const posthogClient = createPostHogClient()

export function getPostHog(): PostHog | null {
  return posthogClient
}

export function schedulePostHogBootInit(): void {
  createPostHogClient()
}

export function initPostHog(): PostHog | null {
  return createPostHogClient()
}

export { posthog }
