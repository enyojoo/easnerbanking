import type { QueryClient } from '@tanstack/react-query'
import { isChannelHealthy, qk, type PersonalScope, type RealtimeHealth } from '@easner/shared'

/** Refetch live feeds when app was backgrounded at least this long. */
export const FOREGROUND_BACKGROUND_THRESHOLD_MS = 5_000

const OPERATIONAL_STALE_OVERRIDES_MS: Record<string, number> = {
  wallets: 60_000,
  transactions: 90_000,
  notifications: 5 * 60_000,
  'notifications-unread': 60_000,
  beneficiaries: 60 * 60_000,
}

function keysMatch(queryKey: readonly unknown[], root: readonly unknown[]): boolean {
  if (queryKey.length < root.length) return false
  return root.every((v, i) => queryKey[i] === v)
}

function queryMatchesOperationalRoot(queryKey: readonly unknown[], scope: PersonalScope): boolean {
  return (
    keysMatch(queryKey, qk.wallets.root(scope)) ||
    keysMatch(queryKey, qk.transactions.root(scope)) ||
    keysMatch(queryKey, qk.beneficiaries.root(scope)) ||
    keysMatch(queryKey, qk.notifications.root(scope.userId)) ||
    keysMatch(queryKey, qk.notifications.unread(scope.userId))
  )
}

function staleThresholdForQuery(queryKey: readonly unknown[]): number {
  const head = String(queryKey[0] ?? '')
  if (head === 'wallets') return OPERATIONAL_STALE_OVERRIDES_MS.wallets
  if (head === 'transactions') return OPERATIONAL_STALE_OVERRIDES_MS.transactions
  if (head === 'notifications') {
    return queryKey.includes('unread')
      ? OPERATIONAL_STALE_OVERRIDES_MS['notifications-unread']
      : OPERATIONAL_STALE_OVERRIDES_MS.notifications
  }
  if (head === 'beneficiaries') return OPERATIONAL_STALE_OVERRIDES_MS.beneficiaries
  return 45_000
}

/** True when any operational query in cache is older than its stale window. */
export function hasStaleOperationalQueries(
  qc: QueryClient,
  scope: PersonalScope,
  nowMs: number = Date.now(),
): boolean {
  const queries = qc.getQueryCache().getAll()
  for (const query of queries) {
    if (query.state.status !== 'success') continue
    if (!queryMatchesOperationalRoot(query.queryKey, scope)) continue
    const updatedAt = query.state.dataUpdatedAt
    if (!updatedAt) continue
    const staleMs = staleThresholdForQuery(query.queryKey)
    if (nowMs - updatedAt > staleMs) return true
  }
  return false
}

export function shouldRefreshOnForeground(input: {
  lastBackgroundAt: number | null
  nowMs?: number
  realtimeHealth: RealtimeHealth | null | undefined
  hasStaleOperationalQueries?: boolean
}): boolean {
  const now = input.nowMs ?? Date.now()
  if (
    input.lastBackgroundAt != null &&
    now - input.lastBackgroundAt >= FOREGROUND_BACKGROUND_THRESHOLD_MS
  ) {
    return true
  }
  if (input.hasStaleOperationalQueries) return true
  if (!isChannelHealthy(input.realtimeHealth)) return true
  return false
}
