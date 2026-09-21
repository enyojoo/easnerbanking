import { describe, expect, it } from "vitest"
import {
  isPayoutPrincipalOnChain,
  isSubmittedFeeSweepStale,
  isTurnkeyFeeSweepOnChain,
  readFeeTurnkeySendId,
} from "./fee-wallet-sweep-meta"

describe("fee wallet sweep helpers", () => {
  it("treats pending Turnkey submits without a signature as not on-chain", () => {
    expect(isTurnkeyFeeSweepOnChain({ status: "pending", txHash: null })).toBe(false)
    expect(isTurnkeyFeeSweepOnChain({ status: "failed", txHash: null })).toBe(false)
  })

  it("treats a signature or settled status as on-chain", () => {
    expect(isTurnkeyFeeSweepOnChain({ status: "pending", txHash: "sig" })).toBe(true)
    expect(isTurnkeyFeeSweepOnChain({ status: "settled", txHash: null })).toBe(true)
  })

  it("reads either fee send id field", () => {
    expect(readFeeTurnkeySendId({ processing_fee_turnkey_send_id: "a" })).toBe("a")
    expect(readFeeTurnkeySendId({ margin_turnkey_send_id: "b" })).toBe("b")
  })

  it("requires a principal tx hash or settled status before a new fee send", () => {
    expect(isPayoutPrincipalOnChain({ turnkey_send_status: "pending" })).toBe(false)
    expect(isPayoutPrincipalOnChain({ turnkey_tx_hash: "sig" })).toBe(true)
    expect(isPayoutPrincipalOnChain({ yc_crypto_deposit_status: "settled" })).toBe(true)
  })

  it("marks submitted fee sends stale after 10 minutes", () => {
    const now = Date.parse("2026-09-21T15:20:00.000Z")
    expect(
      isSubmittedFeeSweepStale(
        { processing_fee_captured_at: "2026-09-21T15:08:06.205Z" },
        now,
      ),
    ).toBe(true)
    expect(
      isSubmittedFeeSweepStale(
        { processing_fee_submitted_at: "2026-09-21T15:19:00.000Z" },
        now,
      ),
    ).toBe(false)
  })
})
