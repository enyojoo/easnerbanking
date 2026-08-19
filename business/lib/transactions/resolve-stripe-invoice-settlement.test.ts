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

  it("infers bank-account settlement rail from Grid Connect credit metadata", () => {
    const detail = resolveStripeInvoiceSettlementDetail({
      status: "settled",
      amount: 1,
      currency: "USD",
      settled_at: "2026-08-19T10:43:21.545Z",
      tx_hash: "2KsnZY5nJkGjasrFufMGJXoPLM12R8dbs8bk9GfU4ZGcshD7XBXoMjntXEnoZGqxk27oSrvV1bQDpVbCe5gTLHro",
      metadata: {
        source: "invoice_stripe",
        invoice_id: "48cd305d-5363-4580-8a7c-eb2178826de5",
        invoice_number: "EINV-47929786BA35",
        settlement_phase: "credited",
        credited_at: "2026-08-19T10:43:21.545Z",
        grid_transaction_id: "Transaction:01a0182e-5173-da6a-0000-d7235d231cb8",
        stripe_connect_va_originator: "EASNER",
        on_chain_settled_at: "2026-08-19T11:06:19.759Z",
        fee_cents: 0,
        gross_cents: 100,
        net_cents: 100,
      },
    })

    expect(detail?.settlementRailLabel).toBe("Bank account")
    expect(detail?.lifecycle.find((s) => s.id === "clearing")?.description).toMatch(/bank account/i)
    expect(detail?.lifecycle.find((s) => s.id === "available")?.state).toBe("complete")
    expect(detail?.lifecycle.find((s) => s.id === "available")?.occurredAt).toBe(
      "2026-08-19T10:43:21.545Z",
    )
    expect(detail?.lifecycle.find((s) => s.id === "available")?.description).toMatch(
      /on-chain settlement completed/i,
    )
  })

  it("maps checkout_stripe collections onto the same settlement lifecycle", () => {
    const detail = resolveStripeInvoiceSettlementDetail({
      status: "settled",
      amount: 0.67,
      currency: "USD",
      metadata: {
        source: "checkout_stripe",
        headline: "Testing",
        collection_source: "link",
        settlement_phase: "credited",
        settlement_rail: "turnkey_stablecoin",
        credited_at: "2026-08-19T00:00:00.000Z",
        fee_cents: 33,
        gross_cents: 100,
        net_cents: 67,
      },
    })

    expect(detail).not.toBeNull()
    expect(detail?.displayTitle).toBe("Testing")
    expect(detail?.invoiceId).toBeNull()
    expect(detail?.settlementRailLabel).toBe("Stablecoin")
    expect(detail?.lifecycle.every((s) => s.state === "complete")).toBe(true)
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
