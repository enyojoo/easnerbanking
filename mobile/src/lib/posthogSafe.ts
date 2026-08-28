import { getPostHog } from './posthog'

type PostHogClient = NonNullable<ReturnType<typeof getPostHog>>

/**
 * Run a PostHog SDK call without letting analytics failures reach React Native's
 * fatal handler (iOS new architecture surfaces these as SIGABRT with no JS text).
 */
export function runWithPostHog<T>(
  label: string,
  fn: (client: PostHogClient) => T,
): T | undefined {
  try {
    const client = getPostHog()
    if (!client) return undefined
    return fn(client)
  } catch (error) {
    console.warn(`[PostHog] ${label} failed`, error)
    return undefined
  }
}
