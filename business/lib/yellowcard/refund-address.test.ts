import { describe, expect, it } from "vitest"
import { resolveYcSendRefundAddress } from "./refund-address"

describe("resolveYcSendRefundAddress", () => {
  const prev = process.env.WALLET_SEND_FEE_SOLANA_ADDRESS_USD

  it("uses user wallet for balance_payout", () => {
    expect(
      resolveYcSendRefundAddress({
        mode: "balance_payout",
        userTurnkeyAddress: "UserWallet111",
      }),
    ).toBe("UserWallet111")
  })

  it("rejects balance_payout without user wallet", () => {
    expect(() =>
      resolveYcSendRefundAddress({ mode: "balance_payout", userTurnkeyAddress: "" }),
    ).toThrow(/user_turnkey/)
  })

  it("uses fee wallet for cross_border_send", () => {
    process.env.WALLET_SEND_FEE_SOLANA_ADDRESS_USD = "FeeWallet999"
    expect(
      resolveYcSendRefundAddress({
        mode: "cross_border_send",
        ledgerCurrency: "USD",
      }),
    ).toBe("FeeWallet999")
    process.env.WALLET_SEND_FEE_SOLANA_ADDRESS_USD = prev
  })
})
