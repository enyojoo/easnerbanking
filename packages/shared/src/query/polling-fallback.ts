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
  critical: 15_000,
  operational: 60_000,
  reference: 10 * 60_000,
  analytics: 5 * 60_000,
}

/**
 * Considered stale if we haven't received any event in this window AND
 * the channel didn't explicitly report subscribed. Keeps transient
 * reconnects from turning into a polling storm.
 */
const HEALTH_STALE_MS = 45_000

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
  return isChannelHealthy(health) ? false : BASE_INTERVAL_MS[band]
}
