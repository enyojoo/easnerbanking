/**
 * Tests for the attachRealtime INSERT prepend path.
 *
 * We mount a mock Supabase channel and fire synthetic postgres_changes
 * events, then assert that the TanStack Query cache was updated correctly
 * without triggering a network refetch.
 */

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { attachRealtime } from "./realtime"
import type { AttachRealtimeOptions, SupabaseLikeClient, SupabaseLikeChannel } from "./realtime"
import { qk } from "./keys"
import type { Scope } from "./scope"

// ---------------------------------------------------------------------------
// Mock Supabase channel
// ---------------------------------------------------------------------------

type EventHandler = (payload: Record<string, unknown>) => void

function buildMockSupabase(): {
  supabase: SupabaseLikeClient
  triggerInsert: (row: Record<string, unknown>, table?: string) => void
  triggerUpdate: (row: Record<string, unknown>, table?: string) => void
  triggerBalanceChange: (row: Record<string, unknown>) => void
} {
  type HandlerEntry = { table: string; handler: EventHandler }
  const handlers: Record<string, HandlerEntry[]> = {}

  const channel: SupabaseLikeChannel = {
    on(_type, filter, callback) {
      const key = filter.event
      if (!handlers[key]) handlers[key] = []
      handlers[key].push({ table: filter.table, handler: callback as EventHandler })
      return this
    },
    subscribe(cb) {
      cb?.("SUBSCRIBED")
      return this
    },
    unsubscribe: () => Promise.resolve(),
  }

  const supabase: SupabaseLikeClient = {
    channel: () => channel,
    removeChannel: () => Promise.resolve(),
  }

  const fire = (event: string, row: Record<string, unknown>, table = "transactions") => {
    for (const entry of handlers[event] ?? []) {
      if (entry.table !== table) continue
      entry.handler({ eventType: event, schema: "public", table, new: row, old: {}, commit_timestamp: "" })
    }
    // Also fire "*" event handlers matching the table
    for (const entry of handlers["*"] ?? []) {
      if (entry.table !== table) continue
      entry.handler({ eventType: event, schema: "public", table, new: row, old: {}, commit_timestamp: "" })
    }
  }

  return {
    supabase,
    triggerInsert: (row, table) => fire("INSERT", row, table),
    triggerUpdate: (row, table) => fire("UPDATE", row, table),
    triggerBalanceChange: (row) => fire("*", row, "wallet_balances"),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCOPE: Scope = { kind: "personal", userId: "user-123" }

function buildQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function seedListCache(qc: QueryClient, items: Record<string, unknown>[]) {
  const key = qk.transactions.list(SCOPE, { limit: 50 })
  qc.setQueryData(key, {
    pages: [{ transactions: items }],
    pageParams: [null],
  })
}

function getListItems(qc: QueryClient): Record<string, unknown>[] {
  const key = qk.transactions.list(SCOPE, { limit: 50 })
  const data = qc.getQueryData<{ pages: { transactions: Record<string, unknown>[] }[] }>(key)
  return data?.pages[0]?.transactions ?? []
}

// Flush all pending batcher timers.
async function flushBatcher() {
  await new Promise((resolve) => setTimeout(resolve, 60))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("attachRealtime INSERT prepend path", () => {
  let qc: QueryClient
  let supabase: SupabaseLikeClient
  let triggerInsert: (row: Record<string, unknown>) => void
  let triggerUpdate: (row: Record<string, unknown>) => void
  let detach: () => void

  const baseRow = () => ({
    id: "db-uuid-new",
    easner_transaction_id: "ETID00001234",
    provider: "noah",
    provider_transaction_id: "noah-tx-new",
    status: "settled",
    amount: 100,
    currency: "USD",
    direction: "in",
    metadata: null,
    created_at: "2025-06-01T10:00:00.000Z",
    occurred_at: "2025-06-01T10:00:00.000Z",
    hidden_from_feed: false,
  })

  const mapper = vi.fn((row: Record<string, unknown>) => ({
    id: String(row.easner_transaction_id ?? row.id),
    ledger_row_id: String(row.id),
    status: "completed",
    name: "Bank Deposit",
    amount: row.amount,
    currency: row.currency,
  }))

  const idFn = (r: unknown) => String((r as { ledger_row_id?: string; id?: string }).ledger_row_id ?? (r as { id?: string }).id ?? "")

  beforeEach(() => {
    qc = buildQc()
    const mock = buildMockSupabase()
    supabase = mock.supabase
    triggerInsert = mock.triggerInsert
    triggerUpdate = mock.triggerUpdate
    mapper.mockClear()

    const opts: AttachRealtimeOptions = {
      qc,
      scope: SCOPE,
      supabase,
      batchMs: 0,
      mapTransactionInsert: mapper,
      transactionListRowId: idFn,
    }
    detach = attachRealtime(opts)
  })

  it("prepends a new row into the first page on INSERT when cache is warm", async () => {
    seedListCache(qc, [
      { id: "existing-1", ledger_row_id: "existing-1", status: "completed", name: "Old tx" },
    ])

    triggerInsert(baseRow())
    await flushBatcher()

    const items = getListItems(qc)
    expect(items).toHaveLength(2)
    // New item should be first
    expect(String(items[0]?.ledger_row_id)).toBe("db-uuid-new")
    expect(mapper).toHaveBeenCalledOnce()
  })

  it("does not prepend the same row twice (duplicate guard)", async () => {
    const existing = { id: "ETID00001234", ledger_row_id: "db-uuid-new", status: "completed" }
    seedListCache(qc, [existing])

    triggerInsert(baseRow())
    await flushBatcher()

    const items = getListItems(qc)
    // Still 1 row, no duplicate
    expect(items).toHaveLength(1)
  })

  it("skips hidden_from_feed rows — does not prepend or invalidate", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    seedListCache(qc, [])

    triggerInsert({ ...baseRow(), hidden_from_feed: true })
    await flushBatcher()

    // No items prepended and no invalidation triggered
    expect(getListItems(qc)).toHaveLength(0)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("falls back to invalidateQueries when mapper returns null", async () => {
    mapper.mockReturnValueOnce(null)
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    seedListCache(qc, [])

    triggerInsert(baseRow())
    await flushBatcher()

    expect(invalidateSpy).toHaveBeenCalled()
    expect(getListItems(qc)).toHaveLength(0)
  })

  it("falls back to invalidateQueries when no warm cache exists (cold start)", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    // No seedListCache — cold start

    triggerInsert(baseRow())
    await flushBatcher()

    expect(invalidateSpy).toHaveBeenCalled()
  })

  it("full-remaps a row on UPDATE when mapper is provided", async () => {
    const existing = { id: "ETID00001234", ledger_row_id: "db-uuid-new", status: "pending" }
    seedListCache(qc, [existing])

    // Map a settled version
    mapper.mockReturnValueOnce({ id: "ETID00001234", ledger_row_id: "db-uuid-new", status: "completed", name: "Remapped" })

    triggerUpdate({ ...baseRow(), status: "settled" })
    await flushBatcher()

    const items = getListItems(qc)
    expect(items).toHaveLength(1)
    expect((items[0] as { status: string }).status).toBe("completed")
    expect((items[0] as { name: string }).name).toBe("Remapped")
  })

  it("marks inactive sibling list queries after successful prepend", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    seedListCache(qc, [
      { id: "existing-1", ledger_row_id: "existing-1", status: "completed", name: "Old tx" },
    ])

    triggerInsert(baseRow())
    await flushBatcher()

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: qk.transactions.root(SCOPE),
      refetchType: "inactive",
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: qk.transactions.root(SCOPE),
      refetchType: "active",
    })
  })

  it("does not invalidate transaction lists on wallet_balances ticks", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    const mock = buildMockSupabase()
    detach()
    detach = attachRealtime({
      qc,
      scope: SCOPE,
      supabase: mock.supabase,
      batchMs: 0,
      mapTransactionInsert: mapper,
      transactionListRowId: idFn,
    })

    mock.triggerBalanceChange({
      id: "wallet-1",
      wallet_id: "wallet-1",
      currency: "USD",
      available_balance: "100.00",
      user_id: "user-123",
    })
    await flushBatcher()

    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[0] === "scope" &&
          (args as { queryKey: unknown[] }).queryKey.includes("transactions"),
      ),
    ).toBe(false)
  })

  it("partial-patches business-style rows by ETID when full remap is unavailable", async () => {
    seedListCache(qc, [{ id: "ETID00001234", status: "pending" }])
    mapper.mockImplementationOnce(() => {
      throw new Error("mapper failed")
    })

    triggerUpdate({ ...baseRow(), status: "settled" })
    await flushBatcher()

    const items = getListItems(qc)
    expect(items).toHaveLength(1)
    expect((items[0] as { status: string }).status).toBe("completed")
  })

  it("backward compat: invalidates on INSERT when no mapper provided", async () => {
    detach()
    // Re-attach without mapper
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    const mock2 = buildMockSupabase()
    const detach2 = attachRealtime({ qc, scope: SCOPE, supabase: mock2.supabase, batchMs: 0 })

    mock2.triggerInsert(baseRow())
    await flushBatcher()

    expect(invalidateSpy).toHaveBeenCalled()
    detach2()
  })

  afterEach(() => {
    detach()
    qc.clear()
  })
})
