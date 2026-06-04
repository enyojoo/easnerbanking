import { describe, expect, it } from "vitest"
import {
  computeDirectTurnkeyWalletSendPricing,
  computeWalletSendProcessingFee,
  normalizeDirectTurnkeyWalletSendReceiveAmount,
  receiveAmountFromDirectTurnkeySendBudget,
} from "./direct-turnkey-wallet-send-pricing"

describe("computeWalletSendProcessingFee", () => {
  it("charges 1% below cap", () => {
    expect(computeWalletSendProcessingFee(10)).toBe(0.1)
    expect(computeWalletSendProcessingFee(100)).toBe(1)
    expect(computeWalletSendProcessingFee(500)).toBe(5)
  })

  it("caps at 20", () => {
    expect(computeWalletSendProcessingFee(2000)).toBe(20)
    expect(computeWalletSendProcessingFee(50000)).toBe(20)
  })
})

describe("computeDirectTurnkeyWalletSendPricing", () => {
  it("is 1:1 with fee on top", () => {
    const p = computeDirectTurnkeyWalletSendPricing({ receiveAmount: 100 })
    expect(p.customerRate).toBe(1)
    expect(p.customerPrincipal).toBe(100)
    expect(p.marginAmount).toBe(1)
    expect(p.totalDebited).toBe(101)
    expect(p.routeCost).toBe(0)
  })

  it("applies cap at 2000 receive", () => {
    const p = computeDirectTurnkeyWalletSendPricing({ receiveAmount: 2000 })
    expect(p.marginAmount).toBe(20)
    expect(p.totalDebited).toBe(2020)
  })
})

describe("send-mode inverse", () => {
  it("B=101 yields R=100", () => {
    expect(receiveAmountFromDirectTurnkeySendBudget({ sendBudget: 101 })).toBe(100)
  })

  it("B=2020 yields R=2000 at cap", () => {
    expect(receiveAmountFromDirectTurnkeySendBudget({ sendBudget: 2020 })).toBe(2000)
  })

  it("normalize matches receive and send modes", () => {
    expect(
      normalizeDirectTurnkeyWalletSendReceiveAmount({
        amountEntryMode: "receive",
        receiveAmount: 100,
      }),
    ).toBe(100)
    expect(
      normalizeDirectTurnkeyWalletSendReceiveAmount({
        amountEntryMode: "send",
        receiveAmount: 0,
        sendBudget: 101,
      }),
    ).toBe(100)
  })
})
