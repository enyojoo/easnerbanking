/**
 * Cold-start / navigation timing marks (speed plan M0).
 *
 * `JS_START_MS` is captured at module-eval time; this module must be the first
 * import in `index.ts` so the mark lands as close as possible to the start of
 * bundle evaluation. It intentionally has no imports that pull in heavy
 * modules at eval time — `analytics` (and through it the PostHog client) is
 * only required lazily when an event actually fires, well after boot.
 */

const JS_START_MS = Date.now()

let coldStartReported = false

/**
 * Call when the first authenticated screen (Dashboard) is interactive with
 * data present. Fires `mobile_cold_start` at most once per app launch (JS
 * bundle lifetime); subsequent calls — remounts, re-logins, tab returns — are
 * no-ops.
 */
export function reportColdStartInteractive(): void {
  if (coldStartReported) return
  coldStartReported = true
  const durationMs = Date.now() - JS_START_MS
  // Lazy require keeps analytics/PostHog off this module's eval path.
  const { analytics } = require('./analytics') as typeof import('./analytics')
  analytics.track('mobile_cold_start', { durationMs })
}

/** Tab-switch duration (nice-to-have M0 mark): tabPress → next screen focus. */
let tabSwitchStartedAtMs: number | null = null

export function markTabSwitchStart(): void {
  tabSwitchStartedAtMs = Date.now()
}

export function markTabSwitchEnd(tabName: string): void {
  if (tabSwitchStartedAtMs === null) return
  const durationMs = Date.now() - tabSwitchStartedAtMs
  tabSwitchStartedAtMs = null
  // Focus events unrelated to a recent tab press (deep links, back nav) are
  // filtered by the null check above; a stale press older than 2s is noise.
  if (durationMs > 2_000) return
  const { analytics } = require('./analytics') as typeof import('./analytics')
  analytics.track('mobile_tab_switch', { tab: tabName, durationMs })
}
