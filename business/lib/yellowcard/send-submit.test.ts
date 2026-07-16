import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/deposit-omnibus/config", () => ({
  depositOmnibusSolanaAddressUsd: () => "omnibus-address",
}))

vi.mock("./refund-address", () => ({
  resolveYcSendRefundAddress: () => "refund-address",
}))

import { buildYcSendSubmitBody } from "./send-submit"

describe("buildYcSendSubmitBody", () => {
  const base = {
    sequenceId: "seq-1",
    customerUID: "user-1",
    channelId: "ch-1",
    currency: "NGN",
    country: "NG",
    refundMode: "balance_payout" as const,
    reason: "balance_payout_quote",
  }

  it("uses settlementInfo.cryptoAmount for direct settlement sends", () => {
    const body = buildYcSendSubmitBody({
      ...base,
      settlementCryptoAmount: 6.5,
      localAmount: 1000,
    })
    expect(body.directSettlement).toBe(true)
    expect(body.localAmount).toBeUndefined()
    expect(body.amount).toBeUndefined()
    expect(body.settlementInfo).toMatchObject({
      cryptoCurrency: "USDC",
      cryptoNetwork: "SOL",
      cryptoAmount: 6.5,
    })
    expect(body.reason).toBe("other")
  })

  it("allows localAmount when direct settlement is disabled", () => {
    const body = buildYcSendSubmitBody({
      ...base,
      directSettlement: false,
      localAmount: 1000,
    })
    expect(body.directSettlement).toBe(false)
    expect(body.localAmount).toBe(1000)
    expect((body.settlementInfo as { cryptoAmount?: number }).cryptoAmount).toBeUndefined()
  })
})
