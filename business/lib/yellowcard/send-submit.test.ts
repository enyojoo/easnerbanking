import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./http", () => ({
  yellowcardFetch: vi.fn(),
}))

import { yellowcardFetch } from "./http"
import { buildYcSendSubmitBody, hydrateYcSendSubmitResult } from "./send-submit"

describe("buildYcSendSubmitBody", () => {
  it("omits localAmount and amount when directSettlement is true", () => {
    const body = buildYcSendSubmitBody({
      sequenceId: "seq-1",
      customerUID: "user-1",
      channelType: "bank",
      currency: "NGN",
      country: "NG",
      refundMode: "balance_payout",
      userTurnkeyAddress: "wallet-1",
      settlementCryptoAmount: 1.48,
      localAmount: 2020.21,
      amount: 1.48,
      destination: { accountNumber: "1", accountType: "bank", networkId: "n", accountName: "A" },
    })
    expect(body.directSettlement).toBe(true)
    expect(body.channelType).toBe("bank")
    expect(body.channelId).toBeUndefined()
    expect(body.localAmount).toBeUndefined()
    expect(body.amount).toBeUndefined()
    expect((body.settlementInfo as { cryptoAmount?: number }).cryptoAmount).toBe(1.48)
  })

  it("preserves six-decimal settlement crypto for YC precision discovery", () => {
    const body = buildYcSendSubmitBody({
      sequenceId: "seq-1",
      customerUID: "user-1",
      channelType: "bank",
      currency: "NGN",
      country: "NG",
      refundMode: "balance_payout",
      userTurnkeyAddress: "wallet-1",
      settlementCryptoAmount: 1.466926,
      destination: { accountNumber: "1", accountType: "bank", networkId: "n", accountName: "A" },
    })
    expect((body.settlementInfo as { cryptoAmount?: number }).cryptoAmount).toBe(1.466926)
  })

  it("keeps an unfunded probe in pending approval mode", () => {
    const body = buildYcSendSubmitBody({
      sequenceId: "yc_precision_probe_1",
      customerUID: "user-1",
      channelType: "momo",
      currency: "NGN",
      country: "NG",
      forceAccept: false,
      refundMode: "balance_payout",
      userTurnkeyAddress: "wallet-1",
      settlementCryptoAmount: 1.468537,
    })
    expect(body.forceAccept).toBe(false)
    expect(body.channelType).toBe("momo")
    expect(body.channelId).toBeUndefined()
    expect((body.settlementInfo as { cryptoAmount?: number }).cryptoAmount).toBe(1.468537)
  })

  it("pins Instant EFT sends to the live channel id and type", () => {
    const body = buildYcSendSubmitBody({
      sequenceId: "seq-za",
      customerUID: "user-1",
      channelType: "eft",
      channelId: "za-eft-1",
      currency: "ZAR",
      country: "ZA",
      refundMode: "balance_payout",
      userTurnkeyAddress: "wallet-1",
      settlementCryptoAmount: 12.4,
      destination: { accountNumber: "63099950123", accountType: "bank", networkId: "n", accountName: "A" },
    })
    expect(body.channelType).toBe("eft")
    expect(body.channelId).toBe("za-eft-1")
    expect(body.country).toBe("ZA")
  })
})

describe("hydrateYcSendSubmitResult", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns POST response when serviceFeeAmountLocal is present", async () => {
    const post = {
      id: "send-1",
      convertedAmount: 2020.12,
      serviceFeeAmountLocal: 20.12,
    }
    const result = await hydrateYcSendSubmitResult(post)
    expect(result).toEqual(post)
    expect(yellowcardFetch).not.toHaveBeenCalled()
  })

  it("returns POST response when settlement wallet and local amount are present", async () => {
    const post = {
      id: "send-1",
      localAmount: 2011.88,
      settlementInfo: { cryptoAmount: 1.45, walletAddress: "Wallet111" },
    }
    const result = await hydrateYcSendSubmitResult(post)
    expect(result).toEqual(post)
    expect(yellowcardFetch).not.toHaveBeenCalled()
  })

  it("GETs /send/{id} when local fee fields are missing on POST", async () => {
    vi.mocked(yellowcardFetch).mockResolvedValueOnce({
      id: "send-1",
      convertedAmount: 2011.88,
      serviceFeeAmountLocal: 20.12,
      settlementInfo: { cryptoAmount: 1.458672 },
    })
    const result = await hydrateYcSendSubmitResult({
      id: "send-1",
      convertedAmount: 2011.88,
      settlementInfo: { cryptoAmount: 1.458672 },
    })
    expect(yellowcardFetch).toHaveBeenCalledTimes(1)
    expect(result.serviceFeeAmountLocal).toBe(20.12)
  })

  it("polls GET when fee fields are not ready on first fetch", async () => {
    vi.mocked(yellowcardFetch)
      .mockResolvedValueOnce({
        id: "send-1",
        convertedAmount: 2011.88,
        settlementInfo: { cryptoAmount: 1.458672 },
      })
      .mockResolvedValueOnce({
        id: "send-1",
        convertedAmount: 2011.88,
        serviceFeeAmountLocal: 20.12,
        settlementInfo: { cryptoAmount: 1.458672 },
      })

    const result = await hydrateYcSendSubmitResult({
      id: "send-1",
      convertedAmount: 2011.88,
      settlementInfo: { cryptoAmount: 1.458672 },
    })
    expect(yellowcardFetch).toHaveBeenCalledTimes(2)
    expect(result.serviceFeeAmountLocal).toBe(20.12)
  })
})
