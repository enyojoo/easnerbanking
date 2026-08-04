import { describe, expect, it } from "vitest"
import { buildStripeInvoiceSettlementLifecycle } from "./stripe-invoice-settlement-lifecycle"

describe("buildStripeInvoiceSettlementLifecycle", () => {
  it("starts at payment received", () => {
    const steps = buildStripeInvoiceSettlementLifecycle({
      status: "processing",
      metadata: {
        source: "invoice_stripe",
        settlement_phase: "payment_received",
      },
      createdAt: "2026-08-01T00:00:00.000Z",
    })
    expect(steps.map((s) => s.id)).toEqual(["payment_received", "clearing", "available"])
    expect(steps[0].state).toBe("complete")
    expect(steps[1].state).toBe("upcoming")
    expect(steps[2].state).toBe("upcoming")
  })

  it("moves to clearing on payout_sent", () => {
    const steps = buildStripeInvoiceSettlementLifecycle({
      status: "processing",
      metadata: {
        source: "invoice_stripe",
        settlement_phase: "payout_sent",
        settlement_rail: "grid_va",
        payout_sent_at: "2026-08-02T00:00:00.000Z",
      },
      createdAt: "2026-08-01T00:00:00.000Z",
    })
    expect(steps[1].state).toBe("current")
    expect(steps[1].description).toMatch(/bank account/i)
    expect(steps[1].description.toLowerCase()).not.toContain("virtual")
  })

  it("completes when credited", () => {
    const steps = buildStripeInvoiceSettlementLifecycle({
      status: "settled",
      metadata: {
        source: "invoice_stripe",
        settlement_phase: "credited",
        settlement_rail: "turnkey_stablecoin",
        credited_at: "2026-08-03T00:00:00.000Z",
      },
      createdAt: "2026-08-01T00:00:00.000Z",
      settledAt: "2026-08-03T00:00:00.000Z",
    })
    expect(steps.every((s) => s.state === "complete")).toBe(true)
  })
})
