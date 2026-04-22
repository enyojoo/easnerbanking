/**
 * Polling fallback policy.
 *
 * The Easner data layer prefers realtime for critical state: balances,
 * approvals, card updates. We want to pay the cost of a polling loop
 * ONLY when the realtime channel is unhealthy. This module codifies the
 * rules so every query hook opts in the same way.
 *
 * Usage:
 *   const health = useSupabaseRealtimeScope()
 *   useQuery({
 *     queryKey: ...,
 *     queryFn: ...,
 *     refetchInterval: pollingIntervalFor("critical", health),
 *     refetchIntervalInBackground: false,
 *   })
 */

import type { RealtimeHealth } from "./realtime"

export type FreshnessBand = "critical" | "operational" | "reference" | "analytics"

/**
 * Base cadence per freshness band, in ms. Only used when realtime is
 * unhealthy; healthy channels return `false` (no polling).
 */
const BASE_INTERVAL_MS: Record<FreshnessBand, number> = {
  critical: 60_000,
  operational: 2 * 60_000,
  reference: 10 * 60_000,
  analytics: 5 * 60_000,
}

/**
 * Short-lived "live activity" boost used right after money-moving actions.
 * Keeps fallback polling snappy for a couple minutes, then automatically
 * returns to calm cadence.
 */
const ACTIVITY_BOOST_WINDOW_MS = 3 * 60_000
const BOOST_INTERVAL_MS: Partial<Record<FreshnessBand, number>> = {
  critical: 15_000,
  operational: 30_000,
}
let lastMoneyActivityAt = 0

/**
 * Considered stale if we haven't received any event in this window AND
 * the channel didn't explicitly report subscribed. Keeps transient
 * reconnects from turning into a polling storm.
 */
const HEALTH_STALE_MS = 45_000

export function markRecentMoneyActivity(atMs: number = Date.now()): void {
  if (!Number.isFinite(atMs) || atMs <= 0) return
  if (atMs > lastMoneyActivityAt) lastMoneyActivityAt = atMs
}

export function hasRecentMoneyActivity(nowMs: number = Date.now()): boolean {
  return nowMs - lastMoneyActivityAt < ACTIVITY_BOOST_WINDOW_MS
}

export function isChannelHealthy(h: RealtimeHealth | null | undefined): boolean {
  if (!h) return false
  if (!h.subscribed) return false
  if (h.lastError) return false
  if (h.lastEventAt == null) return true // just connected; trust it
  return Date.now() - h.lastEventAt < HEALTH_STALE_MS * 3
}

export function pollingIntervalFor(
  band: FreshnessBand,
  health: RealtimeHealth | null | undefined,
): number | false {
  if (isChannelHealthy(health)) return false
  const base = BASE_INTERVAL_MS[band]
  const boosted = BOOST_INTERVAL_MS[band]
  if (boosted && hasRecentMoneyActivity()) return Math.min(base, boosted)
  return base
}
