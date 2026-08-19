import { describe, expect, it } from "vitest"
import { buildGridBalancePayoutOutMetadata, buildGridRefundExpectedPatch } from "./grid-ledger"

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
