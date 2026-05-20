import { describe, expect, it } from "vitest"
import {
  buildNoahBankOnrampCreditKey,
  turnkeyInboundAppliedBalanceDelta,
} from "@/lib/noah/credit-bank-onramp-wallet"

describe("credit-bank-onramp-wallet", () => {
  it("builds stable credit keys", () => {
    expect(buildNoahBankOnrampCreditKey("rule-1", "tx-9")).toBe("noah_bank_onramp:rule-1")
    expect(buildNoahBankOnrampCreditKey(null, "tx-9")).toBe("noah_bank_onramp:tx-9")
  })

  it("does not treat on-chain backfill mirrors as balance credits", () => {
    expect(
      turnkeyInboundAppliedBalanceDelta({ source: "turnkey_onchain_backfill" }),
    ).toBe(false)
    expect(
      turnkeyInboundAppliedBalanceDelta({
        source: "turnkey_onchain_backfill",
        noah_bank_onramp_chain_mirror: true,
      }),
    ).toBe(false)
  })

  it("treats webhook / explicit credit metadata as balance credits", () => {
    expect(turnkeyInboundAppliedBalanceDelta({ source: "turnkey_webhook" })).toBe(true)
    expect(
      turnkeyInboundAppliedBalanceDelta({ wallet_balance_credit_key: "noah_bank_onramp:r1" }),
    ).toBe(true)
    expect(turnkeyInboundAppliedBalanceDelta({ balance_delta_applied: true })).toBe(true)
  })
})
