/**
 * Supabase Realtime → TanStack Query bridge.
 *
 * Design goals:
 *   1. One multiplexed channel per scope (never per query).
 *   2. Cache writes are debounced per queryKey so bursts of events cause a
 *      single render.
 *   3. Every payload is version-guarded: if `version` or `updated_at` is
 *      older than what's already in cache, the write is ignored.
 *   4. For posting-level events (new transactions, new approvals) we prepend
 *      to the first active page and mark siblings `inactive` so they
 *      refetch lazily instead of blowing up the ledger.
 *   5. Channel health is tracked so surfaces can opt into a polling fallback
 *      only when the channel stops delivering events.
 *
 * Callers supply the Supabase client; this file has no direct dependency
 * on `@supabase/supabase-js` types at runtime, so it stays tree-shakable
 * from non-web consumers.
 */

import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { qk } from "./keys"
import { scopeId, type Scope } from "./scope"

// Minimal Supabase client shape we rely on. Using a structural type avoids
// pulling `@supabase/supabase-js` into the shared package's types graph.
export interface SupabaseLikeClient {
  channel(
    name: string,
    opts?: Record<string, unknown>,
  ): SupabaseLikeChannel
  removeChannel(channel: SupabaseLikeChannel): Promise<unknown> | unknown
}

export interface SupabaseLikeChannel {
  on(
    type: "postgres_changes",
    filter: PostgresChangesFilter,
    callback: (payload: PostgresChangesPayload) => void,
  ): SupabaseLikeChannel
  subscribe(
    callback?: (status: string, err?: unknown) => void,
  ): SupabaseLikeChannel
  unsubscribe(): Promise<unknown> | unknown
}

export interface PostgresChangesFilter {
  event: "*" | "INSERT" | "UPDATE" | "DELETE"
  schema: string
  table: string
  filter?: string
}

export interface PostgresChangesPayload<T = Record<string, unknown>> {
  eventType: "INSERT" | "UPDATE" | "DELETE"
  schema: string
  table: string
  new: T
  old: Partial<T>
  commit_timestamp: string
}

export interface RealtimeHealth {
  subscribed: boolean
  lastEventAt: number | null
  lastError: unknown | null
}

export type VersionedRecord = {
  version?: number
  updated_at?: string
  id?: string
}

/**
 * Accept-or-reject helper: keeps the newer record by version, then by
 * `updated_at`, then by presence (incoming wins if no prev).
 */
export function pickNewer<T extends VersionedRecord>(prev: T | undefined, next: T): T {
  if (!prev) return next
  if (typeof prev.version === "number" && typeof next.version === "number") {
    return next.version >= prev.version ? next : prev
  }
  if (prev.updated_at && next.updated_at) {
    return next.updated_at >= prev.updated_at ? next : prev
  }
  return next
}

interface Batcher {
  schedule(key: QueryKey, fn: () => void): void
  flush(): void
}

/**
 * Debounces cache writes at `delayMs`, coalescing by queryKey so
 * the latest closure wins.
 */
export function createBatcher(delayMs: number): Batcher {
  const pending = new Map<string, () => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    const entries = Array.from(pending.values())
    pending.clear()
    for (const fn of entries) {
      try {
        fn()
      } catch (err) {
        console.warn("[realtime] batched handler error", err)
      }
    }
  }
  return {
    schedule(key, fn) {
      pending.set(JSON.stringify(key), fn)
      if (timer == null) timer = setTimeout(flush, delayMs)
    },
    flush,
  }
}

export interface AttachRealtimeOptions {
  qc: QueryClient
  scope: Scope
  supabase: SupabaseLikeClient
  /** Debounce window for cache writes, defaults to 50ms. */
  batchMs?: number
  /** Optional health sink; useful for surfacing "reconnecting" banners. */
  onHealth?: (h: RealtimeHealth) => void
  /** Override DB filter; defaults to best-effort entity/user filter. */
  filter?: string
}

function defaultFilter(scope: Scope): string | undefined {
  if (scope.kind === "business") return `entity_id=eq.${scope.entityId}`
  return `user_id=eq.${scope.userId}`
}

/**
 * Subscribes one multiplexed channel per scope. Returns a cleanup fn.
 * Safe to call repeatedly; callers should keep one subscription active
 * per `Scope` at a time.
 */
export function attachRealtime({
  qc,
  scope,
  supabase,
  batchMs = 50,
  onHealth,
  filter,
}: AttachRealtimeOptions): () => void {
  const batcher = createBatcher(batchMs)
  const scopeFilter = filter ?? defaultFilter(scope)
  const channelName = `scope:${scope.kind}:${scopeId(scope)}`
  const health: RealtimeHealth = { subscribed: false, lastEventAt: null, lastError: null }
  const emit = () => onHealth?.({ ...health })

  const channel = supabase
    .channel(channelName, { config: { broadcast: { self: false } } })

  // --- wallet balances (critical live) ---------------------------------------
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "wallet_balances", filter: scopeFilter },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = (p.new ?? p.old) as VersionedRecord & { wallet_id?: string; id?: string }
      const walletId = row.wallet_id ?? row.id
      if (!walletId) return
      const key = qk.wallets.balance(scope, walletId)
      batcher.schedule(key, () => {
        qc.setQueryData(key, (prev: VersionedRecord | undefined) => pickNewer(prev, row))
        // narrow list refresh so balance totals on dashboards stay consistent
        qc.invalidateQueries({ queryKey: qk.wallets.list(scope), refetchType: "inactive" })
      })
    },
  )

  // --- transactions: posted / updated ----------------------------------------
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "transactions", filter: scopeFilter },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = p.new as VersionedRecord & { id?: string }
      if (!row.id) return
      const key = qk.transactions.root(scope)
      batcher.schedule(key, () => {
        // Prepend to every active list cache (first page) without refetching.
        qc.setQueriesData(
          { queryKey: qk.transactions.root(scope), exact: false },
          (data: unknown) => prependIntoFirstPage(data, row),
        )
        // Mark the rest stale so opening another page revalidates.
        qc.invalidateQueries({
          queryKey: qk.transactions.root(scope),
          refetchType: "inactive",
        })
      })
    },
  )

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "transactions", filter: scopeFilter },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = p.new as VersionedRecord & { id?: string }
      if (!row.id) return
      const detailKey = qk.transactions.detail(scope, row.id)
      batcher.schedule(detailKey, () => {
        qc.setQueryData(detailKey, (prev: VersionedRecord | undefined) => pickNewer(prev, row))
        qc.setQueriesData(
          { queryKey: qk.transactions.root(scope), exact: false },
          (data: unknown) => patchRowInPages(data, row),
        )
      })
    },
  )

  // --- approvals -------------------------------------------------------------
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "approvals", filter: scopeFilter },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const key = qk.approvals.root(scope)
      batcher.schedule(key, () => {
        qc.invalidateQueries({ queryKey: key })
      })
    },
  )

  // --- cards -----------------------------------------------------------------
  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "cards", filter: scopeFilter },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = p.new as VersionedRecord & { id?: string }
      if (!row.id) return
      const key = qk.cards.detail(scope, row.id)
      batcher.schedule(key, () => {
        qc.setQueryData(key, (prev: VersionedRecord | undefined) => pickNewer(prev, row))
        qc.invalidateQueries({ queryKey: qk.cards.list(scope), refetchType: "inactive" })
      })
    },
  )

  // --- notifications (personal only) -----------------------------------------
  if (scope.kind === "personal") {
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${scope.userId}`,
      },
      (p) => {
        health.lastEventAt = Date.now()
        emit()
        const key = qk.notifications.root(scope.userId)
        batcher.schedule(key, () => {
          qc.invalidateQueries({ queryKey: key })
        })
      },
    )
  }

  channel.subscribe((status, err) => {
    health.subscribed = status === "SUBSCRIBED"
    if (err) health.lastError = err
    emit()
  })

  return () => {
    batcher.flush()
    try {
      channel.unsubscribe()
    } catch {
      // noop
    }
    try {
      supabase.removeChannel(channel)
    } catch {
      // noop
    }
    health.subscribed = false
    emit()
  }
}

// ---- internal list helpers ---------------------------------------------------

function prependIntoFirstPage(data: unknown, row: VersionedRecord & { id?: string }): unknown {
  if (!data) return data
  // useInfiniteQuery shape: { pages: [{ items: [...], nextCursor }, ...], pageParams }
  if (typeof data === "object" && data !== null && Array.isArray((data as { pages?: unknown[] }).pages)) {
    const d = data as { pages: unknown[]; pageParams: unknown[] }
    const [firstPage, ...rest] = d.pages
    const nextFirst = mergePrepend(firstPage, row)
    return { ...d, pages: [nextFirst, ...rest] }
  }
  // useQuery list shape: plain array
  if (Array.isArray(data)) {
    return mergePrepend(data, row)
  }
  // object-with-items shape
  if (typeof data === "object" && data !== null && Array.isArray((data as { items?: unknown[] }).items)) {
    return mergePrepend(data, row)
  }
  return data
}

function mergePrepend(page: unknown, row: VersionedRecord & { id?: string }): unknown {
  if (Array.isArray(page)) {
    if (page.some((r) => (r as { id?: string }).id === row.id)) return page
    return [row, ...page]
  }
  if (page && typeof page === "object" && Array.isArray((page as { items?: unknown[] }).items)) {
    const p = page as { items: unknown[] }
    if (p.items.some((r) => (r as { id?: string }).id === row.id)) return page
    return { ...p, items: [row, ...p.items] }
  }
  return page
}

function patchRowInPages(data: unknown, row: VersionedRecord & { id?: string }): unknown {
  if (!data) return data
  if (typeof data === "object" && data !== null && Array.isArray((data as { pages?: unknown[] }).pages)) {
    const d = data as { pages: unknown[]; pageParams: unknown[] }
    let changed = false
    const pages = d.pages.map((p) => {
      const patched = patchPage(p, row)
      if (patched !== p) changed = true
      return patched
    })
    return changed ? { ...d, pages } : data
  }
  return patchPage(data, row)
}

function patchPage(page: unknown, row: VersionedRecord & { id?: string }): unknown {
  if (Array.isArray(page)) {
    let changed = false
    const next = page.map((r) => {
      if ((r as { id?: string }).id === row.id) {
        changed = true
        return pickNewer(r as VersionedRecord, row)
      }
      return r
    })
    return changed ? next : page
  }
  if (page && typeof page === "object" && Array.isArray((page as { items?: unknown[] }).items)) {
    const p = page as { items: unknown[] }
    let changed = false
    const items = p.items.map((r) => {
      if ((r as { id?: string }).id === row.id) {
        changed = true
        return pickNewer(r as VersionedRecord, row)
      }
      return r
    })
    return changed ? { ...p, items } : page
  }
  return page
}
