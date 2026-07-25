import { describe, expect, it, vi } from "vitest"
import { ackGridPayIn, GridPayInAckError } from "./pay-in-ack"

function mockAdmin(input: {
  txByEtid?: Record<string, unknown> | null
  txById?: Record<string, unknown> | null
}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table !== "transactions") return { data: null, error: null }
            if (col === "easner_transaction_id") {
              return { data: input.txByEtid ?? null, error: null }
            }
            if (col === "id") {
              return { data: input.txById ?? null, error: null }
            }
            return { data: null, error: null }
          },
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }
}

describe("ackGridPayIn", () => {
  it("returns existing attestation when already acked", async () => {
    const admin = mockAdmin({
      txByEtid: {
        id: "tx-1",
        user_id: "user-1",
        business_id: null,
        provider: "grid",
        status: "pending",
        metadata: { grid_user_attested_pay_in_at: "2026-01-01T00:00:00.000Z" },
      },
    })

    const result = await ackGridPayIn({
      admin: admin as never,
      userId: "user-1",
      businessId: null,
      easnerTransactionId: "ETID123",
    })

    expect(result.alreadyAttested).toBe(true)
    expect(result.attestedAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("rejects non-grid transactions", async () => {
    const admin = mockAdmin({
      txByEtid: {
        id: "tx-1",
        user_id: "user-1",
        business_id: null,
        provider: "yellowcard",
        status: "pending",
        metadata: {},
      },
    })

    await expect(
      ackGridPayIn({
        admin: admin as never,
        userId: "user-1",
        businessId: null,
        easnerTransactionId: "ETID123",
      }),
    ).rejects.toBeInstanceOf(GridPayInAckError)
  })
})
