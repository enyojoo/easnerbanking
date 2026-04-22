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
  if (scope.kind === "business") return `business_id=eq.${scope.orgId}`
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
      const key = walletId ? qk.wallets.balance(scope, walletId) : null
      batcher.schedule(key ?? qk.wallets.list(scope), () => {
        if (key) {
          qc.setQueryData(key, (prev: VersionedRecord | undefined) => pickNewer(prev, row))
        }
        /**
         * Keep aggregate balances in sync without forcing a refetch.
         *
         * The wallets list query should not have to call Turnkey (or any provider)
         * on every realtime balance tick — that can stampede external services
         * and regress UX. When the payload includes a currency + balance-like
         * field, patch it into the list cache directly.
         */
        qc.setQueryData(qk.wallets.list(scope), (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev
          const base = prev as Record<string, any>
          const balances = (base as any).balances
          if (!balances || typeof balances !== "object") return prev

          const currencyRaw = (row as any).currency ?? (row as any).code
          const currency = typeof currencyRaw === "string" ? currencyRaw.toUpperCase() : null
          if (currency !== "USD" && currency !== "EUR") return prev

          const nextVal =
            (row as any).available_balance ??
            (row as any).availableBalance ??
            (row as any).balance ??
            (row as any).amount
          if (nextVal == null) return prev

          const n = Number.parseFloat(String(nextVal))
          if (!Number.isFinite(n)) return prev

          return {
            ...base,
            balances: {
              ...balances,
              [currency]: String(n),
              source: "realtime",
              detail: "wallet_balances_realtime",
            },
          }
        })
      })
    },
  )

  // --- transactions: posted / updated ----------------------------------------
  channel.on(
    "postgres_changes",
    // IMPORTANT: ledger rows are scoped by `business_id`/`user_id`, while
    // the client scope currently tracks entity separately. Avoid column
    // filter mismatches by subscribing to all transaction events and
    // relying on RLS + narrow query invalidation for correctness.
    { event: "INSERT", schema: "public", table: "transactions" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      const key = qk.transactions.root(scope)
      batcher.schedule(key, () => {
        // Revalidate all active transaction consumers immediately so
        // dashboard money in/out, recent activity, and /transactions
        // stay in lock-step with the latest ledger write.
        qc.invalidateQueries({
          queryKey: key,
          refetchType: "active",
        })
        qc.invalidateQueries({
          queryKey: key,
          refetchType: "inactive",
        })
      })
    },
  )

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "transactions" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      const key = qk.transactions.root(scope)
      batcher.schedule(key, () => {
        qc.invalidateQueries({
          queryKey: key,
          refetchType: "active",
        })
        qc.invalidateQueries({
          queryKey: key,
          refetchType: "inactive",
        })
      })
    },
  )

  // --- approvals -------------------------------------------------------------
  // NOTE: approvals were planned but are not present in all Supabase schemas.
  // Do not subscribe to a non-existent table; reintroduce when the table lands.

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

  // --- user preferences (personal only) --------------------------------------
  // Communication preferences are per-user and live in `public.user_preferences`.
  if (scope.kind === "personal") {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_preferences",
        filter: `user_id=eq.${scope.userId}`,
      },
      () => {
        health.lastEventAt = Date.now()
        emit()
        const key = qk.settings.communication(scope.userId)
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

