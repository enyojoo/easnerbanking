import { InteractionManager, Platform } from 'react-native'
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

/**
 * Lazy init: constructing the client kicks off storage loads and a session-
 * replay remote-config fetch. Doing that eagerly at module scope (the old
 * `import './src/lib/posthog'` side effect in index.ts) put network + JS work
 * on the bundle-eval critical path, before React even started. The client is
 * created on first analytics use, or after boot interactions settle —
 * whichever comes first. Lifecycle events ("Application Opened") are emitted
 * at client init, so nothing is lost by the short deferral.
 */
export function getPostHog(): PostHog | null {
  return createPostHogClient()
}

let bootInitScheduled = false

/** Create the client once boot interactions settle (no-op if already created). */
export function schedulePostHogBootInit(): void {
  if (bootInitScheduled || posthog) return
  bootInitScheduled = true
  if (Platform.OS === 'web') {
    const w = globalThis as { requestIdleCallback?: (cb: () => void) => number }
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => void createPostHogClient())
    } else {
      setTimeout(() => void createPostHogClient(), 1_500)
    }
    return
  }
  InteractionManager.runAfterInteractions(() => {
    createPostHogClient()
  })
}

export { posthog }
