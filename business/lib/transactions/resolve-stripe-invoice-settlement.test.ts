import { describe, expect, it } from "vitest"
import { resolveStripeInvoiceSettlementDetail } from "./resolve-stripe-invoice-settlement"

describe("resolveStripeInvoiceSettlementDetail", () => {
  it("maps invoice reference, amounts, and payment method", () => {
    const detail = resolveStripeInvoiceSettlementDetail({
      status: "processing",
      amount: 56888,
      currency: "USD",
      created_at: "2026-08-04T15:18:03.973Z",
      occurred_at: "2026-08-04T15:18:03.588Z",
      metadata: {
        source: "invoice_stripe",
        invoice_id: "775370a7-d508-4812-8488-ea59d938a9b2",
        invoice_number: "EINV-C792A19D610A",
        settlement_phase: "payment_received",
        fee_cents: 100,
        gross_cents: 5688800,
        net_cents: 5688700,
        payment_method_type: "card",
        settlement_rail: "grid_va",
      },
    })

    expect(detail).not.toBeNull()
    expect(detail?.invoiceId).toBe("775370a7-d508-4812-8488-ea59d938a9b2")
    expect(detail?.invoiceNumber).toBe("EINV-C792A19D610A")
    expect(detail?.displayTitle).toBe("Invoice #EINV-C792A19D610A")
    expect(detail?.paymentMethodLabel).toBe("Card")
    expect(detail?.paymentMethodText).toBe("Card")
    expect(detail?.settlementRailLabel).toBe("Bank account")
    expect(detail?.feeAmount).toBe(1)
    expect(detail?.grossAmount).toBe(56888)
    expect(detail?.netAmount).toBe(56887)
  })

  it("maps enriched payment_method + customer fields", () => {
    const detail = resolveStripeInvoiceSettlementDetail({
      status: "processing",
      amount: 100,
      currency: "USD",
      created_at: "2026-08-04T15:18:03.973Z",
      metadata: {
        source: "invoice_stripe",
        invoice_id: "inv_1",
        invoice_number: "EINV-1",
        settlement_phase: "payment_received",
        fee_cents: 0,
        gross_cents: 10000,
        net_cents: 10000,
        payment_method_type: "card",
        payment_method: {
          type: "card",
          brand: "visa",
          last4: "4242",
          wallet: null,
        },
        customer_name: "Ada Lovelace",
        customer_email: "ada@example.com",
      },
    })

    expect(detail?.paymentMethodLabel).toBe("Visa")
    expect(detail?.paymentMethodText).toBe("Visa •••• 4242")
    expect(detail?.paymentMethod).toMatchObject({
      type: "card",
      brand: "visa",
      last4: "4242",
    })
    expect(detail?.customerName).toBe("Ada Lovelace")
    expect(detail?.customerEmail).toBe("ada@example.com")
  })

  it("returns null for non-invoice rows", () => {
    expect(
      resolveStripeInvoiceSettlementDetail({
        status: "settled",
        metadata: { source: "bank_onramp" },
      }),
    ).toBeNull()
  })
})
