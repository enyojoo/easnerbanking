import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolvePendingPushRecipients } from "@/lib/notifications/expo-push-recipients"

type DeliveryRow = {
  user_id: string
  transaction_id: string
  event_type: string
  expo_push_token: string
  status: string
}

function makeAdminMock(handlers: {
  deliveries?: DeliveryRow[]
  onInsert?: (row: { expo_push_token: string }) => { error: { code: string } | null }
}) {
  const deliveries = [...(handlers.deliveries ?? [])]

  const from = vi.fn((table: string) => {
    if (table !== "push_notification_deliveries") {
      throw new Error(`unexpected table ${table}`)
    }

    const filters: Record<string, string> = {}

    const filterRows = () =>
      deliveries.filter(
        (d) =>
          (!filters.user_id || d.user_id === filters.user_id) &&
          (!filters.transaction_id || d.transaction_id === filters.transaction_id) &&
          (!filters.event_type || d.event_type === filters.event_type) &&
          (!filters.expo_push_token || d.expo_push_token === filters.expo_push_token),
      )

    const chain = {
      eq: vi.fn((col: string, val: string) => {
        filters[col] = val
        return chain
      }),
      maybeSingle: vi.fn(async () => {
        const rows = filterRows()
        return { data: rows[0] ?? null, error: null }
      }),
      then: (resolve: (v: { data: DeliveryRow[]; error: null }) => void) => {
        resolve({ data: filterRows(), error: null })
      },
    }

    return {
      select: vi.fn(() => chain),
      insert: vi.fn((row: { expo_push_token: string }) => {
        const result = handlers.onInsert?.(row) ?? { error: null }
        if (!result.error) {
          deliveries.push({
            user_id: filters.user_id || "u1",
            transaction_id: filters.transaction_id || "tx1",
            event_type: filters.event_type || "transaction_settled",
            expo_push_token: row.expo_push_token,
            status: "queued",
          })
        }
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "d1" }, error: result.error }),
          }),
        }
      }),
    }
  })

  return { from } as unknown as SupabaseClient
}

describe("resolvePendingPushRecipients", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("queues every device token when none were delivered yet", async () => {
    const admin = makeAdminMock({ deliveries: [] })
    const { pending } = await resolvePendingPushRecipients(
      admin,
      { userId: "u1", transactionId: "tx1", eventType: "transaction_settled" },
      ["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"],
    )
    expect(pending.map((p) => p.token)).toEqual(["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"])
  })

  it("skips tokens already queued or sent", async () => {
    const admin = makeAdminMock({
      deliveries: [
        {
          user_id: "u1",
          transaction_id: "tx1",
          event_type: "transaction_settled",
          expo_push_token: "ExponentPushToken[aaa]",
          status: "sent",
        },
      ],
    })
    const { pending } = await resolvePendingPushRecipients(
      admin,
      { userId: "u1", transactionId: "tx1", eventType: "transaction_settled" },
      ["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"],
    )
    expect(pending.map((p) => p.token)).toEqual(["ExponentPushToken[bbb]"])
  })

  it("still queues second token when insert hits unique conflict without per-token row (legacy schema)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const admin = makeAdminMock({
      deliveries: [],
      onInsert: (row) => {
        if (row.expo_push_token === "ExponentPushToken[bbb]") {
          return { error: { code: "23505" } }
        }
        return { error: null }
      },
    })

    const { pending } = await resolvePendingPushRecipients(
      admin,
      { userId: "u1", transactionId: "tx1", eventType: "transaction_settled" },
      ["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"],
    )

    expect(pending.map((p) => p.token)).toEqual(["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"])
    expect(warn).toHaveBeenCalled()
  })
})
