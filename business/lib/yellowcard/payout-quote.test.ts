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

import { listYcRates, findYcBalancePayoutRate } from "@/lib/fx/yc-rates"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
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
    vi.mocked(resolveYcSendChannelId).mockResolvedValue("ch-1")
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
    vi.mocked(submitYcSend).mockResolvedValue({
      id: "send-1",
      localAmount: 5000,
      settlementInfo: {
        cryptoAmount: 4.520121,
        walletAddress: "yc-wallet",
      },
      networkFeeAmountUSD: 0.1,
      serviceFeeAmountUSD: 0.05,
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

    expect(locked.cryptoAmount).toBe(4.520121)
    expect(locked.pricing.totalDebited).toBeGreaterThan(locked.cryptoAmount)
    expect(locked.pricing.totalDebited - locked.cryptoAmount).toBeCloseTo(
      locked.pricing.marginAmount + locked.pricing.processingFee,
      4,
    )
  })
})
