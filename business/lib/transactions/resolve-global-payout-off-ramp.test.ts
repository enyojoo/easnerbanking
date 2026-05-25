import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", () => ({
  buildGlobalPayoutLifecycle: () => [
    { id: "processing", title: "Processing", description: "...", state: "current", occurredAt: null },
    { id: "completed", title: "Completed", description: "...", state: "upcoming", occurredAt: null },
  ],
  formatDisplayPersonName: (n: string) =>
    n === "SAMUEL ODIBA ENYOJO" ? "Samuel Odiba Enyojo" : n,
  formatTransactionDetailHeroTitle: ({
    direction,
    counterpartyName,
  }: {
    direction: "in" | "out"
    counterpartyName?: string | null
  }) =>
    direction === "out" && counterpartyName
      ? `Transfer to ${counterpartyName === "SAMUEL ODIBA ENYOJO" ? "Samuel Odiba Enyojo" : counterpartyName}`
      : "Transfer",
  getGlobalPayoutTransferMethod: () => "Bank transfer",
  isGlobalPayoutOffRampOutRow: (row: { direction?: unknown; metadata?: Record<string, unknown> | null }) =>
    String(row.direction ?? "").toLowerCase() === "out" &&
    String(row.metadata?.payout_type ?? "").toLowerCase() === "global_fiat",
}))

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  extractNoahGlobalPayoutPayOutEnrichment: () => null,
}))

vi.mock("@/lib/noah/build-payout-execute-snapshot", () => ({
  normalizePayoutReviewSnapshot: () => null,
}))

import { resolveGlobalPayoutOffRampDetail } from "./resolve-global-payout-off-ramp"

describe("resolveGlobalPayoutOffRampDetail", () => {
  it("builds degraded detail from receive metadata without payout_review", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "pending",
      amount: 4.52,
      currency: "USD",
      metadata: {
        payout_type: "global_fiat",
        receive_amount: 5000,
        receive_currency: "NGN",
        beneficiary_name: "SAMUEL ODIBA ENYOJO",
      },
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.displayAmount).toBe(5000)
    expect(resolved?.displayCurrency).toBe("NGN")
    expect(resolved?.displayHeroTitle).toBe("Transfer to Samuel Odiba Enyojo")
    expect(resolved?.payoutReview?.exchange_fee).toBe(0)
    expect(resolved?.lifecycle).toHaveLength(2)
  })
})
