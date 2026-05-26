import { describe, expect, it } from "vitest"
import {
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
