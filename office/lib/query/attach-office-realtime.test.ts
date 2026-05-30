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
  }

  return { supabase, triggerUpdate: (row: Record<string, unknown>) => fire("UPDATE", row) }
}

describe("attachOfficeRealtime", () => {
  let qc: QueryClient
  let detach: () => void
  let triggerUpdate: (row: Record<string, unknown>) => void

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const mock = buildMockSupabase()
    detach = attachOfficeRealtime({ qc, supabase: mock.supabase, batchMs: 0 })
    triggerUpdate = mock.triggerUpdate
    qc.setQueryData(officeKeys.transactions(), {
      transactions: [{ id: "tx-1", status: "pending" }],
      summary: {},
    })
  })

  afterEach(() => {
    detach()
    qc.clear()
  })

  it("patches transaction status in cache on UPDATE without active refetch", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    triggerUpdate({ id: "tx-1", status: "settled", updated_at: "2025-06-01T00:00:00.000Z" })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = qc.getQueryData<{ transactions: Array<{ id: string; status: string }> }>(
      officeKeys.transactions(),
    )
    expect(cached?.transactions[0]?.status).toBe("settled")
    expect(
      invalidateSpy.mock.calls.some(
        ([args]) =>
          Array.isArray((args as { queryKey?: unknown[] }).queryKey) &&
          (args as { queryKey: unknown[] }).queryKey[1] === "transactions" &&
          (args as { refetchType?: string }).refetchType === "active",
      ),
    ).toBe(false)
  })
})
