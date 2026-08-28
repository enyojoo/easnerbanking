import { describe, expect, it } from "vitest"
import { isLegitimateStripeSettlementExpectation } from "./stripe-settlement-expectation"

describe("isLegitimateStripeSettlementExpectation", () => {
  it("accepts payout-linked expectations", () => {
    expect(
      isLegitimateStripeSettlementExpectation({
        stripe_payout_id: "po_123",
        invoice_settlement_ids: [],
        checkout_settlement_ids: [],
        metadata: {},
      }),
    ).toBe(true)
  })

  it("accepts settlement-linked expectations without payout id", () => {
    expect(
      isLegitimateStripeSettlementExpectation({
        stripe_payout_id: null,
        invoice_settlement_ids: ["set_1"],
        checkout_settlement_ids: [],
        metadata: {},
      }),
    ).toBe(true)
  })

  it("rejects heal artifacts with only amount metadata", () => {
    expect(
      isLegitimateStripeSettlementExpectation({
        stripe_payout_id: null,
        invoice_settlement_ids: [],
        checkout_settlement_ids: [],
        metadata: { source: "va_turnkey_sweep_heal" },
      }),
    ).toBe(false)
  })

  it("rejects orphan rows with no payout or settlement linkage", () => {
    expect(
      isLegitimateStripeSettlementExpectation({
        stripe_payout_id: null,
        invoice_settlement_ids: [],
        checkout_settlement_ids: [],
        metadata: {},
      }),
    ).toBe(false)
  })
})
