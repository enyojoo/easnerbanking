/**
 * Regression tests for YC webhook parity (feed visibility + reconcile gates).
 */
import { describe, expect, it } from "vitest"
import {
  buildYcParentPayoutCryptoDepositTracking,
  canTransitionYcCrossBorderStatus,
  enrichYcFundBalanceReceiveFromPayload,
  isYcInternalCryptoLeg,
} from "./yc-ledger"
import { isTurnkeyTransactionHiddenFromFeed } from "@/lib/transactions/transaction-feed-filters"

describe("YC webhook parity", () => {
  it("parent payout crypto tracking does not suppress feed", () => {
    const prior = {
      suppress_in_feed: true,
      yc_crypto_deposit_leg: true,
      yc_settlement_leg: true,
      yc_mode: "balance_payout",
    }
    const meta = buildYcParentPayoutCryptoDepositTracking({
      prior,
      txHash: "sig123",
      status: "settled",
    })
    expect(meta.suppress_in_feed).toBeUndefined()
    expect(meta.yc_crypto_deposit_leg).toBeUndefined()
    expect(meta.yc_settlement_leg).toBeUndefined()
    expect(meta.yc_crypto_deposit_tx_hash).toBe("sig123")
    expect(isYcInternalCryptoLeg(meta)).toBe(false)
    expect(isTurnkeyTransactionHiddenFromFeed(meta)).toBe(false)
  })

  it("enriches fund_balance receive metadata from webhook payload", () => {
    const meta = enrichYcFundBalanceReceiveFromPayload(
      { yc_mode: "fund_balance" },
      {
        id: "yc-recv-1",
        channelId: "ch-1",
        status: "processing",
        bankInfo: { accountNumber: "123" },
      },
    )
    expect(meta.yc_receive_id).toBe("yc-recv-1")
    expect(meta.channel_id).toBe("ch-1")
    expect(meta.yc_bank_info).toEqual({ accountNumber: "123" })
  })

  it("blocks illegal cross-border terminal transitions", () => {
    expect(canTransitionYcCrossBorderStatus("completed", "failed")).toBe(false)
    expect(canTransitionYcCrossBorderStatus("leg2_in_progress", "completed")).toBe(true)
    expect(canTransitionYcCrossBorderStatus("awaiting_pay_in", "completed")).toBe(false)
  })
})
