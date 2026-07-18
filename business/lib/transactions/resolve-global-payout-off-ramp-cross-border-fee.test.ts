import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@easner/shared")>()
  return {
    ...actual,
    buildGlobalPayoutLifecycle: () => [],
    buildTransactionTimingRows: () => [],
    resolveTransactionTimingAnchors: () => ({
      startedAt: null,
      completedAt: null,
      failedAt: null,
    }),
    isGlobalPayoutOffRampOutRow: (row: { direction?: unknown; metadata?: Record<string, unknown> | null }) =>
      String(row.direction ?? "").toLowerCase() === "out" &&
      String(row.metadata?.payout_type ?? "").toLowerCase() === "global_fiat",
  }
})

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  extractNoahGlobalPayoutPayOutEnrichment: () => null,
}))

import { resolveGlobalPayoutOffRampDetail } from "./resolve-global-payout-off-ramp"

describe("resolveGlobalPayoutOffRampDetail cross-border processing fee", () => {
  it("keeps local processing fee on payout_review from stored snapshot", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "pending",
      amount: 62689.73,
      currency: "KES",
      metadata: {
        payout_type: "global_fiat",
        yc_mode: "cross_border_send",
        receive_amount: 655000,
        receive_currency: "NGN",
        local_pay_in: 62689.73,
        display_processing_fee_local: 1877.52,
        pay_in_review: {
          principal_local_pay_in: 61_127.23,
        },
        payout_review: {
          you_send_amount: 62689.73,
          total_debited: 62689.73,
          receive_amount: 655000,
          receive_currency: "NGN",
          send_currency: "KES",
          transfer_method: "Local Transfer",
          exchange_rate: 10.715354715212,
          processing_fee: 4.775938,
          exchange_fee: 9.82,
          processing_time: "Within minutes",
          display_processing_fee_local: 1877.52,
        },
      },
    })

    expect(resolved?.payoutReview?.display_processing_fee_local).toBe(1877.52)
    expect(resolved?.payoutReview?.principal_local_pay_in).toBe(61_127.23)
  })
})
