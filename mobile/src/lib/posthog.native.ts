import PostHog, { type PostHogOptions } from 'posthog-react-native'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

export const posthogOptions: PostHogOptions | undefined =
  posthogKey && posthogHost
    ? {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        enableSessionReplay: true,
        sessionReplayConfig: {
          // maskAllTextInputs masks ALL text, not just inputs. Keep false and mask fields via PostHogMaskView.
          maskAllTextInputs: false,
          maskAllImages: false,
          maskAllSandboxedViews: true,
          captureNetworkTelemetry: true,
        },
      }
    : undefined

let posthog: PostHog | null = null

function createPostHogClient(): PostHog | null {
  if (!posthogKey || !posthogHost || !posthogOptions) return null
  if (!posthog) {
    posthog = new PostHog(posthogKey, posthogOptions)
    posthog.register({
      platform: 'mobile',
      environment: __DEV__ ? 'development' : 'production',
    })
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
