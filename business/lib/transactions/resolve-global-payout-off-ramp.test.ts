import { describe, expect, it, vi } from "vitest"

vi.mock("@easner/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@easner/shared")>()),
  buildGlobalPayoutLifecycle: () => [
    { id: "processing", title: "Processing", description: "...", state: "current", occurredAt: null },
    { id: "completed", title: "Completed", description: "...", state: "upcoming", occurredAt: null },
  ],
  computeBalancePayoutExchangeFee: (
    totalDebited: number,
    youSendAmount: number,
    processingFeeAmount: number,
  ) => {
    const raw = totalDebited - youSendAmount - processingFeeAmount
    return raw > 0.000_01 ? Math.round(raw * 100) / 100 : 0
  },
  formatDisplayPersonName: (n: string) =>
    n === "SAMUEL ODIBA ENYOJO" ? "Samuel Odiba Enyojo" : n,
  formatOutboundTransferTitle: (recipientName?: string | null) =>
    recipientName === "SAMUEL ODIBA ENYOJO"
      ? "Samuel Odiba Enyojo"
      : recipientName || "Recipient",
  formatTransactionDetailHeroTitle: ({
    direction,
    counterpartyName,
  }: {
    direction: "in" | "out"
    counterpartyName?: string | null
  }) =>
    direction === "out" && counterpartyName
      ? counterpartyName === "SAMUEL ODIBA ENYOJO" ? "Samuel Odiba Enyojo" : counterpartyName
      : "Transfer",
  getGlobalPayoutTransferMethod: () => "Bank transfer",
  getGlobalPayoutProcessingTime: () => "Within minutes",
  resolveLedgerWhenAt: (input: {
    occurredAt?: string | null
    createdAt?: string | null
  }) => input.occurredAt ?? input.createdAt ?? null,
  buildTransactionTimingRows: () => [{ label: "Expected", value: "Within minutes" }],
  resolveTransactionTimingAnchors: (input: {
    createdAt?: string | null
    webhookCompletedAt?: string | null
    webhookFailedAt?: string | null
  }) => ({
    startedAt: input.createdAt ?? null,
    completedAt: input.webhookCompletedAt ?? null,
    failedAt: input.webhookFailedAt ?? null,
  }),
  isGlobalPayoutOffRampOutRow: (row: { direction?: unknown; metadata?: Record<string, unknown> | null }) =>
    String(row.direction ?? "").toLowerCase() === "out" &&
    (String(row.metadata?.payout_type ?? "").toLowerCase() === "global_fiat" ||
      String(row.metadata?.grid_mode ?? "").toLowerCase() === "balance_payout"),
  TLC_LOCAL_TRANSFER_METHOD: "Local Transfer",
}))

vi.mock("@/lib/noah/global-payout-ledger", () => ({
  extractNoahGlobalPayoutPayOutEnrichment: () => null,
}))

vi.mock("@/lib/noah/build-payout-execute-snapshot", () => ({
  normalizePayoutReviewSnapshot: (raw: unknown) => {
    if (!raw || typeof raw !== "object") return null
    const o = raw as Record<string, unknown>
    const receiveAmount = Number(o.receive_amount)
    const totalDebited = Number(o.total_debited)
    if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
    if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
    return o
  },
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
    expect(resolved?.displayHeroTitle).toBe("Samuel Odiba Enyojo")
    expect(resolved?.payoutReview?.you_send_amount).toBeLessThanOrEqual(4.52)
    expect(resolved?.payoutReview?.exchange_rate).toBeGreaterThan(1)
    expect(resolved?.lifecycle).toHaveLength(2)
  })

  it("resolves cross-border TLC hero and Local Transfer in payout_review", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "pending",
      amount: 95000,
      currency: "NGN",
      metadata: {
        payout_type: "global_fiat",
        yc_mode: "cross_border_send",
        receive_amount: 100,
        receive_currency: "USD",
        local_pay_in: 95000,
        beneficiary_name: "Jane Doe",
        payout_review: {
          you_send_amount: 95000,
          total_debited: 95000,
          receive_amount: 100,
          receive_currency: "USD",
          send_currency: "NGN",
          transfer_method: "Local Transfer",
          exchange_rate: 950,
          processing_fee: 0,
          exchange_fee: 0,
          processing_time: "Within minutes",
        },
        recipient_snapshot: {
          full_name: "Jane Doe",
          bank_name: "Chase",
        },
      },
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.displayHeroTitle).toBe("Jane Doe")
    expect(resolved?.displayDescription).toBe("Jane Doe")
    expect(resolved?.displayAmount).toBe(100)
    expect(resolved?.displayCurrency).toBe("USD")
    expect(resolved?.payoutReview?.transfer_method).toBe("Local Transfer")
    expect(resolved?.payoutReview?.you_send_amount).toBe(95000)
  })

  it("reads Grid review_snapshot when payout_review is missing", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "settled",
      amount: 1.56,
      currency: "USD",
      metadata: {
        payout_type: "global_fiat",
        payout_provider: "grid",
        receive_amount: 2000,
        receive_currency: "NGN",
        beneficiary_name: "Ada Lovelace",
        review_snapshot: {
          you_send_amount: 1.5,
          total_debited: 1.56,
          receive_amount: 2000,
          receive_currency: "NGN",
          send_currency: "USD",
          transfer_method: "Bank transfer",
          exchange_rate: 1333.33,
          processing_fee: 0,
          exchange_fee: 0.06,
          processing_time: "Same day",
        },
      },
    })
    expect(resolved?.payoutReview?.receive_amount).toBe(2000)
    expect(resolved?.payoutReview?.total_debited).toBe(1.56)
    expect(resolved?.payoutReview?.you_send_amount).toBe(1.5)
  })

  it("overlays Grid executed send onto a stale Office payout_review", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "settled",
      amount: 1.52,
      currency: "USD",
      metadata: {
        payout_type: "global_fiat",
        payout_provider: "grid",
        grid_mode: "balance_payout",
        receive_amount: 2000,
        receive_currency: "NGN",
        beneficiary_name: "Samuel Enyojo Odiba",
        crypto_authorized_amount: "1.502259",
        noah_send_amount: "1.502259",
        total_debited: 1.523926,
        processing_fee: 0.014445,
        margin_amount: 0.007222,
        channel_cost: 0.057787,
        payout_review: {
          you_send_amount: 1.444472,
          total_debited: 1.466139,
          receive_amount: 2000,
          receive_currency: "NGN",
          send_currency: "USD",
          transfer_method: "Local transfer",
          exchange_rate: 1384.59,
          processing_fee: 0.014445,
          exchange_fee: 0.007222,
          processing_time: "Within minutes",
        },
      },
    })
    expect(resolved?.payoutReview?.you_send_amount).toBe(1.502259)
    expect(resolved?.payoutReview?.total_debited).toBe(1.523926)
  })

  it("attaches payoutReview from Grid review_snapshot when payout_type is missing", () => {
    const resolved = resolveGlobalPayoutOffRampDetail({
      direction: "out",
      status: "failed",
      amount: 1.55,
      currency: "USD",
      metadata: {
        grid_mode: "balance_payout",
        receive_amount: 2000,
        receive_currency: "NGN",
        beneficiary_name: "Samuel Enyojo Odiba",
        review_snapshot: {
          you_send_amount: 1.441128,
          total_debited: 1.546737,
          receive_amount: 2000,
          receive_currency: "NGN",
          send_currency: "USD",
          transfer_method: "Local transfer",
          exchange_rate: 1387.8017774965165,
          processing_fee: 0.014411,
          exchange_fee: 0.030023,
          processing_time: "Within minutes",
        },
        recipient_snapshot: {
          full_name: "Samuel Enyojo Odiba",
          bank_name: "Kuda",
          account_number: "2067816945",
        },
      },
    })
    expect(resolved?.payoutReview?.receive_amount).toBe(2000)
    expect(resolved?.payoutReview?.total_debited).toBe(1.546737)
    expect(resolved?.recipientSnapshot?.full_name).toBe("Samuel Enyojo Odiba")
  })
})
