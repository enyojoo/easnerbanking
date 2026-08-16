import { describe, expect, it } from "vitest"
import {
  isStablecoinDepositPayInRow,
  resolveStablecoinDepositPayInDetail,
} from "./resolve-stablecoin-deposit-pay-in"

describe("isStablecoinDepositPayInRow", () => {
  it("does not throw for inbound bank deposits (virtual account)", () => {
    expect(
      isStablecoinDepositPayInRow({
        direction: "in",
        provider: "noah",
        metadata: { source_type: "virtual_account" },
      }),
    ).toBe(false)
  })

  it("classifies relay tron deposits", () => {
    expect(
      isStablecoinDepositPayInRow({
        direction: "in",
        provider: "relay",
        metadata: { activity_type: "relay_tron_deposit" },
      }),
    ).toBe(true)
  })

  it("classifies turnkey inbound crypto with chain", () => {
    expect(
      isStablecoinDepositPayInRow({
        direction: "in",
        provider: "turnkey",
        chain: "Solana",
        asset: "USDC",
        metadata: {},
      }),
    ).toBe(true)
  })
})

describe("resolveStablecoinDepositPayInDetail", () => {
  it("returns detail for relay tron deposit without throwing", () => {
    const detail = resolveStablecoinDepositPayInDetail({
      direction: "in",
      provider: "relay",
      amount: 2.31,
      currency: "USD",
      status: "settled",
      metadata: {
        activity_type: "relay_tron_deposit",
        gross_usdt: 3,
        posted_amount: 2.307509,
        posted_currency: "USD",
        fee_amount: 0.692491,
        sender_tron_address: "TXYZabcdefghijklmnopqrstuvwxyz1234",
      },
      chain: "Tron",
      asset: "USDT",
    })
    expect(detail).not.toBeNull()
    expect(detail?.depositAmount).toBe(3)
    expect(detail?.postedAmount).toBe(2.307509)
    expect(detail?.feeAmount).toBe(0.692491)
  })
})
