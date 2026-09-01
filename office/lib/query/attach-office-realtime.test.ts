/**
 * Office admin realtime cache patch tests.
 */

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { attachOfficeRealtime } from "./attach-office-realtime"
import type { SupabaseLikeClient, SupabaseLikeChannel } from "@easner/shared"
import { officeKeys } from "./keys"

type EventHandler = (payload: Record<string, unknown>) => void

function buildMockSupabase() {
  type HandlerEntry = { table: string; handler: EventHandler }
  const handlers: Record<string, HandlerEntry[]> = {}
  let subscribeCb: ((status: string, err?: unknown) => void) | undefined

  const channel: SupabaseLikeChannel = {
    on(_type, filter, callback) {
      const key = filter.event
      if (!handlers[key]) handlers[key] = []
      handlers[key].push({ table: filter.table, handler: callback as EventHandler })
      return this
    },
    subscribe(cb) {
      subscribeCb = cb
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
    const payload = { eventType: event, schema: "public", table, new: row, old: {}, commit_timestamp: "" }
    for (const key of [event, "*"]) {
      for (const entry of handlers[key] ?? []) {
        if (entry.table !== table) continue
        entry.handler(payload)
      }
    }
  }

  return {
    supabase,
    triggerUpdate: (row: Record<string, unknown>, table = "transactions") => fire("UPDATE", row, table),
    triggerInsert: (row: Record<string, unknown>, table: string) => fire("INSERT", row, table),
    resubscribeAfterGap: () => {
      subscribeCb?.("CHANNEL_ERROR", new Error("gap"))
      subscribeCb?.("SUBSCRIBED")
    },
  }
}

describe("attachOfficeRealtime", () => {
  let qc: QueryClient
  let detach: () => void
  let triggerUpdate: (row: Record<string, unknown>, table?: string) => void
  let triggerInsert: (row: Record<string, unknown>, table: string) => void
  let resubscribeAfterGap: () => void

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const mock = buildMockSupabase()
    detach = attachOfficeRealtime({ qc, supabase: mock.supabase, batchMs: 0 })
    triggerUpdate = mock.triggerUpdate
    triggerInsert = mock.triggerInsert
    resubscribeAfterGap = mock.resubscribeAfterGap
    qc.setQueryData(officeKeys.transactions({}), {
      pages: [{ transactions: [{ id: "tx-1", status: "pending" }], summary: {}, nextCursor: null }],
      pageParams: [null],
    })
  })

  afterEach(() => {
    detach()
    qc.clear()
  })

  it("patches transaction status in cache on non-settlement UPDATE without active refetch", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate({ id: "tx-1", status: "processing", updated_at: "2025-06-01T00:00:00.000Z" })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = qc.getQueryData<{
      pages: Array<{ transactions: Array<{ id: string; status: string }> }>
    }>(officeKeys.transactions({}))
    expect(cached?.pages[0]?.transactions[0]?.status).toBe("processing")
    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "transactions" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(false)
  })

  it("invalidates transaction queries on settlement UPDATE so enriched amounts refresh", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate({
      id: "tx-1",
      status: "settled",
      metadata: { reporting_usd_amount: 100 },
      updated_at: "2025-06-01T00:00:00.000Z",
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "transactions" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(true)
  })

  it("refetches the live dashboard on confirmed ledger updates", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate({
      id: "tx-1",
      status: "confirmed",
      updated_at: "2025-06-01T00:00:00.000Z",
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const keys = invalidateSpy.mock.calls.map(([args]) => args as { queryKey?: unknown[]; refetchType?: string })
    expect(
      keys.some(
        (args) =>
          Array.isArray(args.queryKey) &&
          args.queryKey[1] === "transactions" &&
          args.refetchType === "active",
      ),
    ).toBe(true)
    expect(
      keys.some(
        (args) =>
          Array.isArray(args.queryKey) &&
          args.queryKey[1] === "overview" &&
          args.refetchType === "active",
      ),
    ).toBe(true)
  })

  it("refetches the live dashboard when a transaction is inserted", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerInsert({ id: "tx-2", status: "pending" }, "transactions")
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "overview" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(true)
  })

  it("invalidates statements when account_statements changes", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerInsert({ statement_id: "EST-20260829-ABCD" }, "account_statements")
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "statements",
      ),
    ).toBe(true)
  })

  it("invalidates platform-control catalogs on rate and settings changes", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate({ key: "feature_x" }, "system_settings")
    triggerUpdate({ from_currency: "USD" }, "noah_rates")
    triggerUpdate({ country_code: "NG" }, "payout_corridors")
    await new Promise((resolve) => setTimeout(resolve, 10))

    const keys = invalidateSpy.mock.calls
      .map(([args]) => (args as { queryKey?: unknown[] }).queryKey)
      .filter((key): key is unknown[] => Array.isArray(key))
      .map((key) => key[1])

    expect(keys).toContain("system-settings")
    expect(keys).toContain("noah-rates")
    expect(keys).toContain("payout-corridors")
  })

  it("refetches all office queries after a realtime reconnect gap", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    resubscribeAfterGap()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[0] === "office" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(true)
  })

  it("patches the users directory immediately and refetches the live /users page", async () => {
    qc.setQueryData(officeKeys.users(), [
      { id: "u-1", full_name: "Ada", noah_kyc_status: "pending", noahKycStatus: "pending" },
    ])
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate(
      { id: "u-1", full_name: "Ada Lovelace", noah_kyc_status: "approved", updated_at: "2026-09-01T00:00:00.000Z" },
      "users",
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = qc.getQueryData<Array<{ id: string; full_name: string; noahKycStatus: string }>>(
      officeKeys.users(),
    )
    expect(cached?.[0]?.full_name).toBe("Ada Lovelace")
    expect(cached?.[0]?.noahKycStatus).toBe("approved")
    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "users" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(true)
  })

  it("prepends a new user into the directory cache", async () => {
    qc.setQueryData(officeKeys.users(), [{ id: "u-1", full_name: "Ada" }])
    triggerInsert({ id: "u-2", full_name: "Grace", noah_kyc_status: "not_started" }, "users")
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = qc.getQueryData<Array<{ id: string }>>(officeKeys.users())
    expect(cached?.map((u) => u.id)).toEqual(["u-2", "u-1"])
  })

  it("patches businesses immediately and refetches /users because the directory merges org KYB", async () => {
    qc.setQueryData(officeKeys.businesses(), [{ id: "b-1", name: "Acme", verification_status: "pending" }])
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate(
      { id: "b-1", name: "Acme Ltd", verification_status: "verified", updated_at: "2026-09-01T00:00:00.000Z" },
      "businesses",
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = qc.getQueryData<Array<{ id: string; name: string; verification_status: string }>>(
      officeKeys.businesses(),
    )
    expect(cached?.[0]?.name).toBe("Acme Ltd")
    expect(cached?.[0]?.verification_status).toBe("verified")

    const keys = invalidateSpy.mock.calls.map(([args]) => args as { queryKey?: unknown[]; refetchType?: string })
    expect(
      keys.some(
        (args) =>
          Array.isArray(args.queryKey) && args.queryKey[1] === "businesses" && args.refetchType === "active",
      ),
    ).toBe(true)
    expect(
      keys.some(
        (args) => Array.isArray(args.queryKey) && args.queryKey[1] === "users" && args.refetchType === "active",
      ),
    ).toBe(true)
  })
})
