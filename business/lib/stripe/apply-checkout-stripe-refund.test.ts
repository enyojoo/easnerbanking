import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { applyCheckoutStripeRefund } from "./apply-checkout-stripe-refund"

type Update = { table: string; payload: Record<string, unknown> }

function mockAdmin(settlement: Record<string, unknown> | null) {
  const updates: Update[] = []
  const admin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "checkout_stripe_settlements"
                ? settlement
                : { id: "txn_1", metadata: { source: "checkout_stripe" } },
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, payload })
        return { eq: async () => ({ data: null, error: null }) }
      },
    }),
  }
  return { admin: admin as unknown as SupabaseClient, updates }
}

const SETTLEMENT = {
  id: "set_1",
  business_id: "biz_1",
  phase: "payment_received",
  ledger_transaction_id: "txn_1",
  stripe_event_ids: ["evt_prior"],
  stripe_refund_id: null,
}

describe("applyCheckoutStripeRefund", () => {
  it("fails the settlement and its ledger entry", async () => {
    const { admin, updates } = mockAdmin(SETTLEMENT)

    const result = await applyCheckoutStripeRefund(admin, {
      chargeId: "ch_1",
      refundId: "re_1",
      stripeEventId: "evt_refund",
    })

    expect(result).toMatchObject({ applied: true, settlementId: "set_1", businessId: "biz_1" })
    expect(updates.find((u) => u.table === "checkout_stripe_settlements")?.payload).toMatchObject({
      phase: "failed",
      stripe_refund_id: "re_1",
      stripe_event_ids: ["evt_prior", "evt_refund"],
    })
    expect(updates.find((u) => u.table === "transactions")?.payload).toMatchObject({
      status: "failed",
      metadata: expect.objectContaining({ settlement_phase: "failed", stripe_refund_id: "re_1" }),
    })
  })

  it("keeps a credited settlement intact and flags it for clawback", async () => {
    const { admin, updates } = mockAdmin({ ...SETTLEMENT, phase: "credited" })

    const result = await applyCheckoutStripeRefund(admin, { chargeId: "ch_1", refundId: "re_1" })

    expect(result).toMatchObject({ applied: false, skipped: "credited" })
    const patch = updates.find((u) => u.table === "checkout_stripe_settlements")?.payload
    expect(patch).toMatchObject({ stripe_refund_id: "re_1" })
    expect(patch).not.toHaveProperty("phase")
    expect(updates.some((u) => u.table === "transactions")).toBe(false)
  })

  it("is idempotent once a refund is recorded", async () => {
    const { admin } = mockAdmin({ ...SETTLEMENT, stripe_refund_id: "re_1" })

    const result = await applyCheckoutStripeRefund(admin, { chargeId: "ch_1", refundId: "re_1" })
    expect(result).toMatchObject({ applied: false, skipped: "already_applied" })
  })

  it("ignores charges with no collection settlement", async () => {
    const { admin, updates } = mockAdmin(null)

    const result = await applyCheckoutStripeRefund(admin, { chargeId: "ch_unknown", refundId: "re_1" })
    expect(result).toMatchObject({ applied: false, skipped: "not_found" })
    expect(updates).toHaveLength(0)
  })
})
