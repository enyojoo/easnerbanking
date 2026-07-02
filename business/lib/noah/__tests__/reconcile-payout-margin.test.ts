import { describe, expect, it } from "vitest"
import {
  buildGlobalPayoutChannelFeeReconciliationPatch,
  buildGlobalPayoutMarginReconciliationPatch,
  pickNoahBreakdownAmount,
} from "@/lib/noah/reconcile-payout-margin"

describe("pickNoahBreakdownAmount", () => {
  it("reads BusinessFee from Noah Breakdown", () => {
    expect(
      pickNoahBreakdownAmount(
        {
          Breakdown: [
            { Type: "ChannelFee", Amount: "0.788" },
            { Type: "BusinessFee", Amount: "0.057" },
          ],
        },
        "BusinessFee",
      ),
    ).toBe(0.057)
  })
})

describe("buildGlobalPayoutMarginReconciliationPatch", () => {
  it("patches metadata when BusinessFee matches margin_amount within tolerance", () => {
    const result = buildGlobalPayoutMarginReconciliationPatch({
      transactionId: "tx-1",
      priorMetadata: { margin_amount: 0.057, easner_payout_id: "payout-1" },
      txData: {
        Breakdown: [{ Type: "BusinessFee", Amount: "0.057" }],
      },
    })
    expect(result.patch.margin_reconciled).toBe(true)
    expect(result.patch.noah_business_fee).toBe(0.057)
    expect(result.patch.margin_reconciliation_delta).toBe(0)
  })

  it("returns empty patch when margin_amount missing", () => {
    const result = buildGlobalPayoutMarginReconciliationPatch({
      transactionId: "tx-1",
      priorMetadata: {},
      txData: {
        Breakdown: [{ Type: "BusinessFee", Amount: "0.05" }],
      },
    })
    expect(result.patch).toEqual({})
  })
})

describe("buildGlobalPayoutChannelFeeReconciliationPatch", () => {
  it("warns and patches when ChannelFee matches quoted exchange_fee", () => {
    const result = buildGlobalPayoutChannelFeeReconciliationPatch({
      transactionId: "tx-2",
      priorMetadata: {
        exchange_fee: 0.79,
        channel_cost: 0.79,
        payout_review: { exchange_fee: 0.79 },
      },
      txData: {
        Breakdown: [{ Type: "ChannelFee", Amount: "0.79" }],
      },
    })
    expect(result.noahChannelFee).toBe(0.79)
    expect(result.deltaQuoted).toBe(0)
    expect(result.patch.channel_fee_reconciled).toBe(true)
    expect(result.patch.noah_settlement_channel_fee).toBe(0.79)
    // The display exchange_fee (channel component that foots with total) is no longer rewritten
    // from the settled Noah ChannelFee, so payout_review is left untouched here.
    expect(result.patch.payout_review).toBeUndefined()
  })

  it("returns empty patch when Breakdown missing ChannelFee", () => {
    const result = buildGlobalPayoutChannelFeeReconciliationPatch({
      transactionId: "tx-3",
      priorMetadata: { exchange_fee: 0.5 },
      txData: {},
    })
    expect(result.patch).toEqual({})
  })

  it("matches settled NGN tx e2fd8401 quoted ChannelFee", () => {
    const result = buildGlobalPayoutChannelFeeReconciliationPatch({
      transactionId: "e2fd8401",
      priorMetadata: {
        exchange_fee: 0.557706,
        channel_cost: 0.557706,
        noah_channel_fee: 0.557706,
        payout_review: { exchange_fee: 0.557706 },
      },
      txData: {
        Breakdown: [{ Type: "ChannelFee", Amount: "0.557706" }],
      },
    })
    expect(result.deltaQuoted).toBe(0)
    expect(result.patch.channel_fee_reconciled).toBe(true)
  })

  it("delta when pre-tightening bundled exchange_fee included margin", () => {
    const result = buildGlobalPayoutChannelFeeReconciliationPatch({
      transactionId: "e2fd8401-bundled",
      priorMetadata: { exchange_fee: 0.581808 },
      txData: {
        Breakdown: [{ Type: "ChannelFee", Amount: "0.557706" }],
      },
    })
    expect(result.deltaQuoted).toBeCloseTo(-0.024102, 4)
  })
})
