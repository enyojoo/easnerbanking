import { Platform } from 'react-native'
import PostHog, { type PostHogOptions } from 'posthog-react-native'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

export const posthogOptions: PostHogOptions | undefined =
  posthogKey && posthogHost
    ? {
        host: posthogHost,
        captureAppLifecycleEvents: Platform.OS !== 'web',
        // Session replay is native-only (iOS/Android). Expo web keeps event tracking only.
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
  }
  return posthog
}

// Eager init so session replay can fetch remote config before the first screen renders.
export const posthogClient = createPostHogClient()

export function getPostHog() {
  return posthogClient
}

export { posthog }
