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
import { patchRowInPages, prependIntoFirstPage } from "./infinite-cache"
import { markRecentMoneyActivity } from "./polling-fallback"
import { scopeId, type Scope } from "./scope"
import {
  displayEasnerTransactionIdForList,
  mapLedgerStatusForUserFeed,
  shouldIncludeRowInUserFeed,
} from "../transactions/map-ledger-list-row"
import { resolveYcPayInFeedStatus } from "../transactions/yc-pay-in-display"

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
  /**
   * Map a raw DB row from a Realtime INSERT event into the list-item shape
   * expected by the `transactions` infinite query cache. Return `null` to fall
   * back to the existing invalidate behaviour (e.g. unmapped row types).
   * When provided, new transactions are prepended directly into the cache
   * without a network round-trip.
   */
  mapTransactionInsert?: (row: Record<string, unknown>) => unknown | null
  /**
   * Extract the stable id used for duplicate detection and patch matching.
   * Defaults to `ledger_row_id ?? id`. Must match the id used by the router
   * for transaction detail navigation.
   */
  transactionListRowId?: (row: unknown) => string
  /**
   * KYC/KYB identity rows live outside TanStack Query on some surfaces
   * (business profile cache, mobile AuthContext). Called after the shared
   * verification query is invalidated so those stores can refetch/patch.
   */
  onIdentityChange?: (event: IdentityChangeEvent) => void
}

export type IdentityChangeEvent = {
  table:
    | "businesses"
    | "business_kyb_applications"
    | "users"
    | "business_stripe_connect_accounts"
    | "business_checkout_settings"
  row: Record<string, unknown>
}

function defaultFilter(scope: Scope): string | undefined {
  if (scope.kind === "business") return `business_id=eq.${scope.orgId}`
  return `user_id=eq.${scope.userId}`
}

/** Realtime filter for `public.transactions` – must match RLS scoping to avoid refetch storms. */
function transactionsTableFilter(scope: Scope): string {
  if (scope.kind === "business") return `business_id=eq.${scope.orgId}`
  return `user_id=eq.${scope.userId}`
}

/** Default id extractor: matches `transactionDetailLookupId` in mobile and business routing. */
function defaultListRowId(row: unknown): string {
  const r = row as { ledger_row_id?: string; id?: string; transaction_id?: string }
  return String(r.ledger_row_id ?? r.id ?? r.transaction_id ?? "")
}

/** Lazy-revalidate sibling list queries (e.g. filtered views) without refetching active ones. */
function scheduleInactiveTransactionListRevalidation(qc: QueryClient, scope: Scope): void {
  qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: "inactive" })
}

/** Invalidate all active transaction list queries under `scope`. Fallback path. */
function scheduleTransactionsFeedRefresh(
  qc: QueryClient,
  scope: Scope,
  batcher: Batcher,
): void {
  const key = qk.transactions.root(scope)
  batcher.schedule(key, () => {
    markRecentMoneyActivity()
    qc.invalidateQueries({ queryKey: key, refetchType: "active" })
  })
}

/**
 * Partial status/metadata patch when full remap did not hit a cached row.
 * Tries list id (ETID / mobile id) first, then DB uuid via ledger_row_id.
 */
function tryPartialTransactionPatch(
  qc: QueryClient,
  key: QueryKey,
  row: Record<string, unknown>,
  mapped: unknown | null,
  idFn: (row: unknown) => string,
): boolean {
  const dbRowId = row.id != null ? String(row.id) : ""
  const patchFn = (prev: unknown) => ({
    ...(prev as Record<string, unknown>),
    status: mapLedgerStatusForList(
      String(row.status ?? (prev as { status?: string }).status ?? ""),
      row.metadata,
    ),
    metadata: row.metadata ?? (prev as { metadata?: unknown }).metadata,
  })

  if (mapped != null) {
    const listId = idFn(mapped)
    if (listId && patchRowInPages(qc, key, listId, patchFn, idFn)) return true
  }

  const meta = row.metadata as Record<string, unknown> | null | undefined
  const derivedListId = displayEasnerTransactionIdForList({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: row.provider_transaction_id != null ? String(row.provider_transaction_id) : null,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  if (derivedListId && patchRowInPages(qc, key, derivedListId, patchFn, idFn)) return true

  if (dbRowId) {
    const ledgerIdFn = (r: unknown) =>
      String((r as { ledger_row_id?: string }).ledger_row_id ?? "")
    if (patchRowInPages(qc, key, dbRowId, patchFn, ledgerIdFn)) return true
  }

  return false
}

/**
 * Handle a Realtime INSERT event:
 * - When `mapTransactionInsert` is provided, map the DB row into a list item
 *   and prepend it into the first page of every cached infinite query.
 *   Sibling queries that are not active get marked `inactive` for lazy revalidation.
 *   If mapping returns null or prepend finds no existing cache, fall back to invalidate.
 * - Without mapper: existing invalidate behaviour (backward compatible).
 */
function scheduleTransactionInsert(
  qc: QueryClient,
  scope: Scope,
  batcher: Batcher,
  row: Record<string, unknown>,
  mapTransactionInsert: ((row: Record<string, unknown>) => unknown | null) | undefined,
  idFn: (row: unknown) => string,
): void {
  const key = qk.transactions.root(scope)
  batcher.schedule(key, () => {
    markRecentMoneyActivity()

    if (!shouldIncludeRowInUserFeed(row)) return

    if (!mapTransactionInsert) {
      qc.invalidateQueries({ queryKey: key, refetchType: "active" })
      return
    }

    const listRow = mapTransactionInsert(row)
    if (listRow == null) {
      qc.invalidateQueries({ queryKey: key, refetchType: "active" })
      return
    }

    const prepended = prependIntoFirstPage(qc, key, listRow, idFn)
    if (!prepended) {
      // No warm cache yet – normal refetch on first mount will pick it up.
      qc.invalidateQueries({ queryKey: key, refetchType: "active" })
      return
    }
    scheduleInactiveTransactionListRevalidation(qc, scope)
  })
}

/**
 * Handle a Realtime UPDATE event:
 * - When `mapTransactionInsert` is provided, produce a full list-shape row and replace
 *   the cached entry. Falls back to partial status/metadata patch.
 * - Without mapper: existing partial patch behaviour.
 */
function scheduleTransactionRowPatch(
  qc: QueryClient,
  scope: Scope,
  batcher: Batcher,
  row: Record<string, unknown>,
  mapTransactionInsert: ((row: Record<string, unknown>) => unknown | null) | undefined,
  idFn: (row: unknown) => string,
): void {
  const key = qk.transactions.root(scope)
  const dbRowId = row.id != null ? String(row.id) : ""
  if (!dbRowId) {
    scheduleTransactionsFeedRefresh(qc, scope, batcher)
    return
  }
  batcher.schedule(key, () => {
    markRecentMoneyActivity()

    let mapped: unknown | null = null
    if (mapTransactionInsert) {
      try {
        mapped = mapTransactionInsert(row)
      } catch {
        mapped = null
      }
    }

    // Full remap: replace the existing cache row with the freshly mapped version.
    if (mapped != null) {
      const mappedId = idFn(mapped)
      if (mappedId && patchRowInPages(qc, key, mappedId, () => mapped, idFn)) return
    }

    if (tryPartialTransactionPatch(qc, key, row, mapped, idFn)) return

    qc.invalidateQueries({ queryKey: key, refetchType: "active" })
  })
}

const IDENTITY_STATUS_FIELDS = [
  "verification_status",
  "noah_kyc_status",
  "verification_rejection_reasons",
  "kyb_verified_at",
  "kyc_verified_at",
  "grid_customer_id",
  "status",
  "last_errors",
] as const

function identityFieldsChanged(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): boolean {
  if (!prev) return true
  return IDENTITY_STATUS_FIELDS.some((key) => {
    if (!(key in next)) return false
    return prev[key] !== next[key]
  })
}

function scheduleIdentityRefresh(
  qc: QueryClient,
  scope: Scope,
  batcher: Batcher,
  table: IdentityChangeEvent["table"],
  row: Record<string, unknown>,
  onIdentityChange: ((event: IdentityChangeEvent) => void) | undefined,
): void {
  const key = qk.verification.root(scope)
  batcher.schedule(key, () => {
    qc.invalidateQueries({ queryKey: key, refetchType: "active" })
    qc.invalidateQueries({ queryKey: qk.auth.profile(), refetchType: "active" })
    if (scope.kind === "business") {
      qc.invalidateQueries({ queryKey: qk.org.detail(scope.orgId), refetchType: "active" })
      qc.invalidateQueries({ queryKey: qk.collections.connectStatus(scope), refetchType: "active" })
      qc.invalidateQueries({ queryKey: qk.collections.checkoutSettings.root(scope), refetchType: "active" })
    }
    onIdentityChange?.({ table, row })
  })
}

function mapLedgerStatusForList(
  st: string,
  metadata?: unknown,
): string {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null
  const ycFeed = resolveYcPayInFeedStatus(meta, st)
  if (ycFeed) return ycFeed
  return mapLedgerStatusForUserFeed(st)
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
  mapTransactionInsert,
  transactionListRowId,
  onIdentityChange,
}: AttachRealtimeOptions): () => void {
  const batcher = createBatcher(batchMs)
  const scopeFilter = filter ?? defaultFilter(scope)
  const idFn = transactionListRowId ?? defaultListRowId
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
         * on every realtime balance tick – that can stampede external services
         * and regress UX. When the payload includes a currency + balance-like
         * field, patch it into the list cache directly.
         */
        qc.setQueryData(qk.wallets.list(scope), (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev
          const base = prev as Record<string, any>

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

          const balances = base.balances
          if (balances && typeof balances === "object") {
            return {
              ...base,
              balances: {
                ...balances,
                [currency]: String(n),
                source: "realtime",
                detail: "wallet_balances_realtime",
              },
            }
          }

          // Mobile personal scope: flat `{ USD, EUR, source }` envelope.
          return {
            ...base,
            [currency]: String(n),
            source: "realtime",
            detail: "wallet_balances_realtime",
          }
        })
      })
    },
  )

  // --- transactions: posted / updated ----------------------------------------
  const txFilter = transactionsTableFilter(scope)
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "transactions",
      filter: txFilter,
    },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = (p.new ?? {}) as Record<string, unknown>
      scheduleTransactionInsert(qc, scope, batcher, row, mapTransactionInsert, idFn)
    },
  )

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "transactions",
      filter: txFilter,
    },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      const row = (p.new ?? {}) as Record<string, unknown>
      scheduleTransactionRowPatch(qc, scope, batcher, row, mapTransactionInsert, idFn)
    },
  )

  // --- approvals -------------------------------------------------------------
  // NOTE: approvals were planned but are not present in all Supabase schemas.
  // Do not subscribe to a non-existent table; reintroduce when the table lands.

  // --- Stripe collections (business Incoming + Payment Links) ----------------
  if (scope.kind === "business") {
    const refreshIncomingAndLinks = () => {
      markRecentMoneyActivity()
      qc.invalidateQueries({ queryKey: qk.wallets.incoming(scope), refetchType: "active" })
      qc.invalidateQueries({ queryKey: qk.collections.paymentLinks.root(scope), refetchType: "active" })
    }
    for (const table of [
      "checkout_stripe_settlements",
      "invoice_stripe_settlements",
      "payment_links",
    ] as const) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: scopeFilter },
        () => {
          health.lastEventAt = Date.now()
          emit()
          batcher.schedule(qk.wallets.incoming(scope), refreshIncomingAndLinks)
        },
      )
    }
  }

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

  // --- KYC / KYB identity ----------------------------------------------------
  // Webhook handlers persist partner status to these tables; the verification
  // tab and status banner must update without a full reload.
  if (scope.kind === "business") {
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "businesses",
        filter: `id=eq.${scope.orgId}`,
      },
      (p) => {
        const row = (p.new ?? {}) as Record<string, unknown>
        if (!identityFieldsChanged(p.old as Record<string, unknown> | undefined, row)) return
        health.lastEventAt = Date.now()
        emit()
        scheduleIdentityRefresh(qc, scope, batcher, "businesses", row, onIdentityChange)
      },
    )
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "business_kyb_applications",
        filter: `business_id=eq.${scope.orgId}`,
      },
      (p) => {
        const row = ((p.new ?? p.old) ?? {}) as Record<string, unknown>
        health.lastEventAt = Date.now()
        emit()
        scheduleIdentityRefresh(qc, scope, batcher, "business_kyb_applications", row, onIdentityChange)
      },
    )
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "business_stripe_connect_accounts",
        filter: `business_id=eq.${scope.orgId}`,
      },
      (p) => {
        const row = ((p.new ?? p.old) ?? {}) as Record<string, unknown>
        health.lastEventAt = Date.now()
        emit()
        scheduleIdentityRefresh(qc, scope, batcher, "business_stripe_connect_accounts", row, onIdentityChange)
      },
    )
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "business_checkout_settings",
        filter: `business_id=eq.${scope.orgId}`,
      },
      (p) => {
        const row = ((p.new ?? p.old) ?? {}) as Record<string, unknown>
        health.lastEventAt = Date.now()
        emit()
        scheduleIdentityRefresh(qc, scope, batcher, "business_checkout_settings", row, onIdentityChange)
      },
    )
  } else {
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "users",
        filter: `id=eq.${scope.userId}`,
      },
      (p) => {
        const row = (p.new ?? {}) as Record<string, unknown>
        if (!identityFieldsChanged(p.old as Record<string, unknown> | undefined, row)) return
        health.lastEventAt = Date.now()
        emit()
        scheduleIdentityRefresh(qc, scope, batcher, "users", row, onIdentityChange)
      },
    )
  }

  // --- user preferences (personal only) --------------------------------------
  if (scope.kind === "personal") {
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${scope.userId}`,
      },
      () => {
        health.lastEventAt = Date.now()
        emit()
        const key = qk.notifications.root(scope.userId)
        batcher.schedule(key, () => {
          qc.invalidateQueries({ queryKey: key, refetchType: "active" })
          qc.invalidateQueries({ queryKey: qk.notifications.unread(scope.userId), refetchType: "active" })
        })
      },
    )

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

