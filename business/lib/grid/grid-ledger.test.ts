import { describe, expect, it } from "vitest"
import { buildGridBalancePayoutOutMetadata, buildGridRefundExpectedPatch, mergeGridPayoutLifecycle } from "./grid-ledger"

const baseInput = {
  easnerPayoutId: "payout-1",
  easnerTransactionId: "ETID12345678",
  quoteId: "Quote:abc",
  sequenceId: "grid_quote_abc",
  fiatAmount: 2000,
  fiatCurrency: "NGN",
  countryCode: "NG",
  destinationRef: "recipient:recipient-1",
  recipientSnapshot: { full_name: "Ada Lovelace" },
  cryptoAuthorizedAmount: 1.501175,
  reviewSnapshot: {
    you_send_amount: 1.5,
    total_debited: 1.56,
    receive_amount: 2000,
    receive_currency: "NGN",
    send_currency: "USD",
    exchange_fee: 0.06,
    processing_fee: 0,
    exchange_rate: 1333.33,
    transfer_method: "Bank transfer",
    processing_time: "Same day",
  },
  pricing: {
    totalDebited: 1.56,
    customerPrincipal: 1.5,
    marginAmount: 0,
    processingFee: 0,
    channelCost: 0.06,
    customerRate: 1333.33,
  },
}

describe("buildGridBalancePayoutOutMetadata", () => {
  it("marks the row as a global fiat payout so wallet debit and refunds attach", () => {
    const meta = buildGridBalancePayoutOutMetadata(baseInput)
    expect(meta.payout_type).toBe("global_fiat")
    expect(meta.flow).toBe("global_fiat_offramp")
    expect(meta.payout_provider).toBe("grid")
    expect(meta.grid_mode).toBe("balance_payout")
    expect(meta.payout_review).toEqual(meta.review_snapshot)
    expect(meta.crypto_authorized_amount).toBe("1.501175")
  })
})

describe("buildGridRefundExpectedPatch", () => {
  it("flags a Grid USDC refund so Turnkey inbound is suppressed", () => {
    const patch = buildGridRefundExpectedPatch(
      { easner_payout_id: "payout-1" },
      { refundAmount: 1.5, refundTxHash: "sig-refund" },
    )
    expect(patch.grid_refund_expected).toBe(true)
    expect(patch.noah_refund_expected).toBe(true)
    expect(patch.grid_refund_amount).toBe(1.5)
    expect(patch.grid_refund_tx_hash).toBe("sig-refund")
  })
})

describe("mergeGridPayoutLifecycle", () => {
  it("sets shared processing/completed timestamps without undefined overwrites", () => {
    const first = mergeGridPayoutLifecycle({ easner_payout_id: "payout-1" }, { processing_at: "2026-08-19T10:00:00Z" })
    expect(first.processing_at).toBe("2026-08-19T10:00:00Z")
    const settled = mergeGridPayoutLifecycle(first, { completed_at: "2026-08-19T10:05:00Z" })
    expect(settled.processing_at).toBe("2026-08-19T10:00:00Z")
    expect(settled.completed_at).toBe("2026-08-19T10:05:00Z")
    expect(Object.values(settled).some((v) => v === undefined)).toBe(false)
  })
})
