import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}))

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcBalancePayoutRate: vi.fn(),
}))

vi.mock("@/lib/payout-providers/yellowcard-provider", () => ({
  resolveYcSendChannelId: vi.fn(),
  resolveYcSendSubmitChannel: vi.fn(),
  findYcSendChannel: vi.fn(),
}))

vi.mock("@/lib/yellowcard/map-recipient-to-yc-send", () => ({
  mapRecipientToYcSend: vi.fn(),
}))

vi.mock("@/lib/yellowcard/kyc-metadata", () => ({
  buildYcKycPersonMetadata: vi.fn(() => ({ name: "Test User" })),
}))

vi.mock("@/lib/yellowcard/send-submit", () => ({
  submitYcSend: vi.fn(),
  hydrateYcSendSubmitResult: (sendRes: unknown) => Promise.resolve(sendRes),
}))

vi.mock("@/lib/processing-fee/quote-processing-fee-bps", () => ({
  quoteFiatProcessingFeeBps: vi.fn().mockResolvedValue(100),
}))

vi.mock("@/lib/yellowcard/send-fee-config", () => ({
  fetchYcSendServiceFeeConfig: vi.fn().mockResolvedValue({
    minFeeLocal: 0,
    feePercentage: 1,
    flatFeeLocal: 0,
  }),
}))

import { listYcRates, findYcBalancePayoutRate } from "@/lib/fx/yc-rates"
import { resolveYcSendSubmitChannel } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { submitYcSend } from "@/lib/yellowcard/send-submit"
import { lockYcBalancePayoutSend } from "./payout-quote"

const recipient = {
  id: "r-1",
  currency: "NGN",
  country_code: "NG",
  bank_name: "Test Bank",
} as never

describe("lockYcBalancePayoutSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveYcSendSubmitChannel).mockResolvedValue({
      channelId: "ch-1",
      channelType: "bank",
    })
    vi.mocked(listYcRates).mockResolvedValue([])
    vi.mocked(findYcBalancePayoutRate).mockReturnValue({
      rate: 1335.6388919029,
      yc_sell: 1355.96793609,
    } as never)
    vi.mocked(mapRecipientToYcSend).mockResolvedValue({
      destination: { networkId: "net-1" },
      root: {},
    } as never)
  })

  it("recomputes pricing from YC cryptoAmount and validates economics", async () => {
    let call = 0
    vi.mocked(submitYcSend).mockImplementation(async (input) => {
      call += 1
      const cryptoAmount = Number(input.settlementCryptoAmount)
      const convertedAmount = Math.round(cryptoAmount * 1355.96793609 * 100) / 100
      const serviceFeeAmountLocal = Math.round(convertedAmount * 0.01 * 100) / 100
      return {
        id: `send-${call}`,
        channelId: `routed-${call}`,
        convertedAmount,
        serviceFeeAmountLocal,
        settlementInfo: { cryptoAmount, walletAddress: "yc-wallet" },
        networkFeeAmountUSD: 0.1,
        serviceFeeAmountUSD: 0.05,
      }
    })

    const locked = await lockYcBalancePayoutSend({
      userId: "user-1",
      customerUID: "user-1",
      recipient,
      receiveFiatAmount: 5000,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: "user-wallet",
      senderProfile: { residenceCountry: "NG" },
    })

    expect(locked.cryptoAmount).toBeGreaterThan(0)
    expect(locked.channelId).toBe("routed-1")
    expect(locked.lockedLocalAmount).toBeGreaterThanOrEqual(5000)
    expect(locked.recipientSurplusLocal).toBeLessThanOrEqual(locked.payoutQuantumLocal)
    expect(locked.pricing.totalDebited).toBeGreaterThan(locked.cryptoAmount)
    expect(submitYcSend).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "bank", channelId: "ch-1" }),
    )
    expect(mapRecipientToYcSend).toHaveBeenCalledWith(
      recipient,
      { channelId: "ch-1" },
    )
    expect(locked.pricing.totalDebited - locked.cryptoAmount).toBeCloseTo(
      locked.pricing.marginAmount + locked.pricing.processingFee,
      4,
    )
  })

  it("locks South Africa Instant EFT with live channelId and submit type bank", async () => {
    vi.mocked(resolveYcSendSubmitChannel).mockResolvedValue({
      channelId: "za-eft-1",
      channelType: "bank",
    })
    vi.mocked(submitYcSend).mockImplementation(async (input) => {
      const cryptoAmount = Number(input.settlementCryptoAmount)
      const convertedAmount = Math.round(cryptoAmount * 16.4 * 100) / 100
      return {
        id: "send-za",
        channelId: "za-eft-1",
        convertedAmount,
        serviceFeeAmountLocal: Math.round(convertedAmount * 0.01 * 100) / 100,
        settlementInfo: { cryptoAmount, walletAddress: "yc-wallet" },
        networkFeeAmountUSD: 0,
        serviceFeeAmountUSD: 0.1,
      }
    })
    vi.mocked(findYcBalancePayoutRate).mockReturnValue({
      rate: 16.29,
      yc_sell: 16.4,
    } as never)

    await lockYcBalancePayoutSend({
      userId: "user-1",
      customerUID: "user-1",
      recipient: {
        id: "r-za",
        currency: "ZAR",
        country_code: "ZA",
        bank_name: "First National Bank (South Africa)",
      } as never,
      receiveFiatAmount: 200,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: "user-wallet",
      senderProfile: { residenceCountry: "NG" },
    })

    expect(submitYcSend).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "bank",
        channelId: "za-eft-1",
        country: "ZA",
        currency: "ZAR",
      }),
    )
  })
})
