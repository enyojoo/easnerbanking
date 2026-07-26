/**
 * Unit tests for Yellowcard ledger helpers.
 */
import { describe, expect, it } from "vitest"
import {
  buildYcFundBalanceDepositReviewSnapshot,
  resolveYcFundBalanceDepositTitle,
} from "@easner/shared"
import {
  buildYcBalancePayoutOutMetadata,
  buildYcFundBalanceReceiveMetadata,
  buildYcOmnibusCryptoDepositMetadata,
  buildYcParentPayoutCryptoDepositTracking,
  buildYcRefundExpectedPatch,
  isYcBalancePayoutRow,
  isYcFundBalanceRow,
  isYcInternalCryptoLeg,
  mergeYcPayoutLifecycle,
} from "./yc-ledger"

describe("yc-ledger metadata builders", () => {
  it("builds fund_balance receive metadata with bank_onramp flow", () => {
    const meta = buildYcFundBalanceReceiveMetadata({
      sequenceId: "yc_fb_1",
      transferId: "tr-1",
      localPayIn: 100000,
      localCurrency: "NGN",
      usdCredit: 65,
      processingFee: 0.65,
    })
    expect(meta.yc_mode).toBe("fund_balance")
    expect(meta.flow).toBe("bank_onramp")
    expect(meta.yc_sequence_id).toBe("yc_fb_1")
    expect(meta.usd_credit).toBe(65)
    expect(isYcFundBalanceRow(meta)).toBe(true)
  })

  it("includes deposit_review when provided at quote time", () => {
    const depositReview = buildYcFundBalanceDepositReviewSnapshot({
      localPayIn: 100000,
      localCurrency: "NGN",
      usdCredit: 65,
      processingFee: 0.65,
      exchangeRate: 1538,
      residenceCountry: "NG",
      payInRail: "bank_transfer",
    })
    const depositDisplayTitle = resolveYcFundBalanceDepositTitle({
      residenceCountry: "NG",
      payInRail: "bank_transfer",
      localCurrency: "NGN",
    })
    const meta = buildYcFundBalanceReceiveMetadata({
      sequenceId: "yc_fb_2",
      localPayIn: 100000,
      localCurrency: "NGN",
      usdCredit: 65,
      processingFee: 0.65,
      residenceCountry: "NG",
      payInRail: "bank_transfer",
      customerRate: 1538,
      depositReview,
      depositDisplayTitle,
      displayHeroTitle: depositDisplayTitle,
    })
    expect(meta.deposit_review).toEqual(depositReview)
    expect(meta.deposit_display_title).toBe("Nigeria Bank Deposit")
    expect(meta.display_hero_title).toBe("Nigeria Bank Deposit")
    expect(meta.residence_country).toBe("NG")
    expect(meta.pay_in_rail).toBe("bank_transfer")
  })

  it("builds balance_payout OUT metadata with global_fiat shape", () => {
    const meta = buildYcBalancePayoutOutMetadata({
      easnerPayoutId: "payout-1",
      easnerTransactionId: "ETID12345678",
      sequenceId: "yc_quote_abc",
      totalDebited: 50,
      cryptoAuthorizedAmount: 48.5,
      processingFee: 0.5,
      receiveAmount: 75000,
      receiveCurrency: "NGN",
      channelId: "ch-1",
      destinationRef: "recipient:recipient-1",
    })
    expect(meta.payout_type).toBe("global_fiat")
    expect(meta.payout_provider).toBe("yellowcard")
    expect(meta.yc_mode).toBe("balance_payout")
    expect(meta.processing_fee_pending).toBe(true)
    expect(meta.easner_payout_id).toBe("payout-1")
    expect(isYcBalancePayoutRow(meta)).toBe(true)
  })

  it("marks omnibus crypto deposit legs for feed suppression", () => {
    const meta = buildYcOmnibusCryptoDepositMetadata({
      ycMode: "balance_payout",
      easnerPayoutId: "payout-1",
      txHash: "sig123",
    })
    expect(meta.suppress_in_feed).toBe(true)
    expect(meta.yc_crypto_deposit_leg).toBe(true)
    expect(isYcInternalCryptoLeg(meta)).toBe(true)
  })

  it("parent payout crypto tracking stays visible in feed", () => {
    const meta = buildYcParentPayoutCryptoDepositTracking({
      prior: { yc_mode: "balance_payout", easner_payout_id: "payout-1" },
      txHash: "sig456",
      status: "settled",
    })
    expect(meta.suppress_in_feed).toBeUndefined()
    expect(meta.yc_crypto_deposit_leg).toBeUndefined()
    expect(isYcInternalCryptoLeg(meta)).toBe(false)
  })

  it("sets yc + noah refund expected flags on failure", () => {
    const patch = buildYcRefundExpectedPatch({ foo: 1 }, { refundAmount: 48.5, refundTxHash: "ref1" })
    expect(patch.yc_refund_expected).toBe(true)
    expect(patch.noah_refund_expected).toBe(true)
    expect(patch.yc_refund_amount).toBe(48.5)
    expect(patch.yc_refund_tx_hash).toBe("ref1")
  })

  it("merges payout lifecycle timestamps without overwriting completed_at", () => {
    const first = mergeYcPayoutLifecycle({}, { processing_at: "2026-01-01T00:00:00Z" })
    const second = mergeYcPayoutLifecycle(first, {
      completed_at: "2026-01-01T01:00:00Z",
      processing_at: "2026-01-01T00:30:00Z",
    })
    expect(second.processing_at).toBe("2026-01-01T00:00:00Z")
    expect(second.completed_at).toBe("2026-01-01T01:00:00Z")
  })
})
