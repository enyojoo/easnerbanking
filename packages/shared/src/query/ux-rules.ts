/**
 * UX rules for data-driven surfaces.
 *
 * These constants encode the "premium/trustworthy fintech" feel:
 *   - never wipe the screen with a full-page spinner when we have any
 *     cached or SSR state
 *   - skeletons only on the first-ever render of a surface
 *   - refreshed-at timestamps kick in only once data is noticeably old
 *   - balances never move optimistically; rows can
 *   - destructive mutations block; everything else stays inline
 *
 * Screens import these instead of re-inventing thresholds.
 */

export const UX = {
  skeleton: {
    /** Show skeletons only on the very first load of a surface. */
    firstLoadOnly: true,
    /** Minimum time a skeleton stays on screen to avoid flashes. */
    minVisibleMs: 200,
  },
  refreshHint: {
    /** Show "Updated Xs ago" once the data is this old. */
    showWhenUpdatedAtOlderThanMs: 60_000,
    /** Switch to a warning tone past this threshold. */
    staleThresholdMs: 5 * 60_000,
  },
  optimistic: {
    /** Balances NEVER move optimistically. */
    allowForBalances: false,
    /** Rows (ledger entries, approvals, etc.) may render a pending row. */
    allowForRows: true,
    /** How long to wait for a realtime event before surfacing "reconciling". */
    reconcileTimeoutMs: 10_000,
  },
  placeholder: {
    /** Keep previous rows visible while a filter change refetches. */
    keepPreviousOnFilters: true,
    /** Keep dashboard shell visible during entity switch; fade content only. */
    keepPreviousOnEntitySwitch: true,
  },
  block: {
    /** Destructive actions get a blocking overlay / disabled state. */
    destructiveMutations: true,
    /** Non-destructive mutations stay inline. */
    nonDestructiveMutations: false,
  },
  mobile: {
    /** Mask balance digits after this age on cold start until revalidation. */
    coldStartBalanceMaskAfterMs: 5 * 60_000,
    /** Debounce realtime cache writes per queryKey. */
    realtimeDebounceMs: 50,
  },
} as const

export type UXRules = typeof UX
