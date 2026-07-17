import { describe, expect, it } from "vitest"
import {
  buildNoahTransactionWebhookEnvelope,
  readNoahTransactionIdFromPendingRow,
} from "@/lib/reconciliation/noah-transaction-poll"

describe("buildNoahTransactionWebhookEnvelope", () => {
  it("wraps transaction data for webhook replay", () => {
    const tx = { ID: "tx-1", Status: "Settled", Updated: "2026-01-01T00:00:00.000Z" }
    const env = buildNoahTransactionWebhookEnvelope(tx)
    expect(env.EventType).toBe("Transaction")
    expect(env.Data).toEqual(tx)
    expect(env.Occurred).toBe("2026-01-01T00:00:00.000Z")
  })
})

describe("readNoahTransactionIdFromPendingRow", () => {
  it("ignores pending provider transaction ids", () => {
    expect(
      readNoahTransactionIdFromPendingRow({
        providerTransactionId: "global_payout_pending:abc",
        metadata: {},
      }),
    ).toBeNull()
  })

  it("prefers metadata noah_transaction_id", () => {
    expect(
      readNoahTransactionIdFromPendingRow({
        providerTransactionId: "global_payout_pending:abc",
        metadata: { noah_transaction_id: "noah-tx-9" },
      }),
    ).toBe("noah-tx-9")
  })
})
