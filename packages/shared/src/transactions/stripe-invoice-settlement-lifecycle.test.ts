import { describe, expect, it } from "vitest"
import {
  buildStripeInvoiceSettlementLifecycle,
  inferStripeSettlementRail,
  resolveStripeCollectionListDisplay,
  stripeCollectionSettlementTitle,
} from "./stripe-invoice-settlement-lifecycle"

describe("inferStripeSettlementRail", () => {
  it("does not treat a later VA→Turnkey sweep as the Stripe payout rail", () => {
    expect(
      inferStripeSettlementRail({
        source: "invoice_stripe",
        grid_turnkey_sweep_status: "settled",
      }),
    ).toBeNull()
    expect(
      inferStripeSettlementRail({
        source: "invoice_stripe",
        grid_transaction_id: "Transaction:abc",
        grid_turnkey_sweep_status: "settled",
      }),
    ).toBe("grid_va")
  })
})

describe("stripeCollectionSettlementTitle", () => {
  it("uses Invoice #number for invoice settlements", () => {
    expect(
      stripeCollectionSettlementTitle({
        source: "invoice_stripe",
        invoice_number: "EINV-47929786BA35",
      }),
    ).toBe("Invoice #EINV-47929786BA35")
  })

  it("falls back to Invoice when the number is missing", () => {
    expect(stripeCollectionSettlementTitle({ source: "invoice_stripe" })).toBe("Invoice")
  })
})

describe("resolveStripeCollectionListDisplay", () => {
  it("uses gross cents as the list/hero amount", () => {
    expect(
      resolveStripeCollectionListDisplay({
        direction: "in",
        amount: 0.67,
        currency: "USD",
        metadata: {
          source: "invoice_stripe",
          invoice_number: "EINV-1",
          gross_cents: 100,
          net_cents: 67,
          fee_cents: 33,
        },
      }),
    ).toEqual({
      displayAmount: 1,
      displayCurrency: "USD",
      ledgerAmount: 0.67,
      ledgerCurrency: "USD",
      displayDescription: "Invoice #EINV-1",
      displayHeroTitle: "Invoice #EINV-1",
    })
  })
})

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

  it("infers grid_va rail from Connect credit metadata without settlement_rail", () => {
    const steps = buildStripeInvoiceSettlementLifecycle({
      status: "settled",
      metadata: {
        source: "invoice_stripe",
        settlement_phase: "credited",
        grid_transaction_id: "Transaction:01a0182e-5173-da6a-0000-d7235d231cb8",
        stripe_connect_va_originator: "EASNER",
        credited_at: "2026-08-19T10:43:21.545Z",
        on_chain_settled_at: "2026-08-19T11:06:19.759Z",
      },
      createdAt: "2026-08-17T19:26:20.012Z",
      settledAt: "2026-08-19T10:43:21.545Z",
    })
    expect(steps[1].description).toMatch(/bank account/i)
    expect(steps[2].state).toBe("complete")
    expect(steps[2].occurredAt).toBe("2026-08-19T10:43:21.545Z")
    expect(steps[2].description).toMatch(/on-chain settlement completed/i)
  })
})
