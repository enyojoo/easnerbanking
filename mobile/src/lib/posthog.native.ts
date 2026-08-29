import { Platform } from 'react-native'
import PostHog, { type PostHogOptions } from 'posthog-react-native'
import { consumerPlatformFromOs } from '@easner/shared'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

/**
 * Native PostHog config — event capture only (no session replay).
 *
 * Build 221 crashed opening Send/Recipients with `com.posthog.PostHogReplayIntegration`
 * writing snapshots at SIGABRT (RCTExceptionsManager). Replay stays enabled on web.
 *
 * - enableSessionReplay: false on native.
 * - captureLog: false — stdout piping also crashed release iOS.
 * - Init try/catch + runWithPostHog (posthogSafe.ts).
 * - Deferred navigation screen capture (App.tsx).
 */
export const posthogOptions: PostHogOptions | undefined =
  posthogKey && posthogHost
    ? {
        host: posthogHost,
        captureAppLifecycleEvents: Platform.OS !== 'web',
        enableSessionReplay: false,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          captureNetworkTelemetry: false,
          captureLog: false,
        },
      }
    : undefined

let posthog: PostHog | null = null
let posthogInitFailed = false

function createPostHogClient(): PostHog | null {
  if (posthogInitFailed) return null
  if (!posthogKey || !posthogHost || !posthogOptions) return null
  if (!posthog) {
    try {
      posthog = new PostHog(posthogKey, posthogOptions)
      if (__DEV__) {
        posthog.debug(true)
      }
      posthog.register({
        platform: consumerPlatformFromOs(Platform.OS),
        os: Platform.OS,
        environment: __DEV__ ? 'development' : 'production',
      })
    } catch (error) {
      posthogInitFailed = true
      posthog = null
      console.warn('[PostHog] Native init failed; analytics disabled for this session.', error)
      return null
    }
  }
  return posthog
}

export function getPostHog(): PostHog | null {
  return createPostHogClient()
}

export function schedulePostHogBootInit(): void {
  createPostHogClient()
}

export function initPostHog(): PostHog | null {
  return createPostHogClient()
}

export { posthog }
