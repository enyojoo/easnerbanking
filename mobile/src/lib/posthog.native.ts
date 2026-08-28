import { Platform } from 'react-native'
import PostHog, { type PostHogOptions } from 'posthog-react-native'
import { consumerPlatformFromOs } from '@easner/shared'

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST

/**
 * Native PostHog config — matches build 206: session replay on iOS and Android.
 *
 * Safety retained from crash investigation (these are not session replay):
 * - captureLog: false — disables stdout piping only; replay screenshots stay on.
 * - Init try/catch + analytics runWithPostHog (see posthogSafe.ts) — SDK errors must not fatal the app.
 * - Deferred navigation screen capture (App.tsx) — posthog.screen() off the transition critical path.
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
