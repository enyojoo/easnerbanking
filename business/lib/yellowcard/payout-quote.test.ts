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
  denyYcSend: vi.fn(async () => undefined),
  hydrateYcSendSubmitResult: (sendRes: unknown) => Promise.resolve(sendRes),
}))

vi.mock("@/lib/yellowcard/send-fee-config", () => ({
  fetchYcSendServiceFeeConfig: vi.fn(),
}))

vi.mock("@/lib/yellowcard/account-balance", () => ({
  fetchYcAvailableBalance: vi.fn(async () => 0),
}))

vi.mock("@/lib/processing-fee/quote-processing-fee-bps", () => ({
  quoteFiatProcessingFeeBps: vi.fn(async () => 100),
}))

import { listYcRates, findYcBalancePayoutRate } from "@/lib/fx/yc-rates"
import { fetchYcAvailableBalance } from "@/lib/yellowcard/account-balance"
import { fetchYcSendServiceFeeConfig } from "@/lib/yellowcard/send-fee-config"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { denyYcSend, submitYcSend } from "@/lib/yellowcard/send-submit"
import { lockYcBalancePayoutSend } from "./payout-quote"

const recipient = {
  id: "r-1",
  currency: "NGN",
  country_code: "NG",
  bank_name: "Test Bank",
} as never

const DIRECT_FEE = { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 }
/** NGN bank balance settlement is a flat 100 NGN rather than a percentage. */
const BALANCE_FEE = { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 100 }

const originalEnv = { ...process.env }

/** Direct settlement quantises to USD cents, so the credit lands above the quote. */
function directSendResponse(cryptoUsd: number, ycRate: number) {
  const localAmount = Math.round(cryptoUsd * ycRate * 100) / 100
  const serviceFeeAmountLocal = Math.round(localAmount * 0.01 * 100) / 100
  return {
    id: "send-direct",
    localAmount,
    convertedAmount: localAmount,
    rate: ycRate,
    serviceFeeAmountLocal,
    settlementInfo: { cryptoAmount: cryptoUsd, walletAddress: "yc-deposit-wallet" },
  }
}

function enableExactLocal() {
  process.env.YC_EXACT_LOCAL_PAYOUT = "true"
  process.env.YELLOWCARD_USDC_TOPUP_ADDRESS_SOL = "yc-topup-address"
  process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "5"
  vi.mocked(fetchYcAvailableBalance).mockResolvedValue(500)
  vi.mocked(fetchYcSendServiceFeeConfig).mockImplementation(async (query) =>
    query.directSettlement === false ? BALANCE_FEE : DIRECT_FEE,
  )
}

describe("lockYcBalancePayoutSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.YC_EXACT_LOCAL_PAYOUT
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
    vi.mocked(fetchYcSendServiceFeeConfig).mockResolvedValue(DIRECT_FEE)
    vi.mocked(fetchYcAvailableBalance).mockResolvedValue(0)
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
    expect(locked.settlementMode).toBe("direct_crypto")
  })

  it("credits the recipient the exact amount when the float covers it", async () => {
    enableExactLocal()
    const rate = 1355.96793609
    vi.mocked(submitYcSend).mockResolvedValue({
      id: "send-exact",
      // YC honours localAmount verbatim for balance settlement.
      convertedAmount: 2000,
      localAmount: 2000,
      rate,
      status: "pending_approval",
    })

    const locked = await lockYcBalancePayoutSend({
      userId: "user-1",
      customerUID: "user-1",
      recipient,
      receiveFiatAmount: 2000,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: "user-wallet",
      senderProfile: { residenceCountry: "NG" },
    })

    expect(locked.settlementMode).toBe("balance_exact")
    expect(locked.lockedLocalAmount).toBe(2000)
    expect(locked.walletAddress).toBe("yc-topup-address")
    // (2000 + 100 flat) / 1355.96793609, ceiled to 6dp.
    expect(locked.cryptoAmount).toBe(1.54871)
    // Surplus swept to the fee wallet still equals quoted revenue.
    expect(locked.pricing.totalDebited - locked.cryptoAmount).toBeCloseTo(
      locked.pricing.marginAmount + locked.pricing.processingFee,
      6,
    )
    expect(submitYcSend).toHaveBeenCalledTimes(1)
    const body = vi.mocked(submitYcSend).mock.calls[0]![0]
    expect(body.directSettlement).toBe(false)
    expect(body.localAmount).toBe(2000)
    // Nothing is paid until the sweep lands.
    expect(body.forceAccept).toBe(false)
  })

  it("denies the send and falls back to direct settlement when YC does not honour localAmount", async () => {
    enableExactLocal()
    const rate = 1355.96793609
    vi.mocked(submitYcSend).mockImplementation(async (args) => {
      if (args.directSettlement === false) {
        // Anything other than the quoted amount must not be used.
        return { id: "send-exact", convertedAmount: 2011.72, localAmount: 2011.72, rate } as never
      }
      return directSendResponse(Number(args.settlementCryptoAmount ?? 0), rate) as never
    })

    const locked = await lockYcBalancePayoutSend({
      userId: "user-1",
      customerUID: "user-1",
      recipient,
      receiveFiatAmount: 2000,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: "user-wallet",
      senderProfile: { residenceCountry: "NG" },
    })

    expect(denyYcSend).toHaveBeenCalledWith("send-exact")
    expect(locked.settlementMode).toBe("direct_crypto")
    expect(locked.walletAddress).toBe("yc-deposit-wallet")
    expect(locked.lockedLocalAmount).toBeGreaterThanOrEqual(2000)
  })

  it("stays on direct settlement when the float is short", async () => {
    enableExactLocal()
    vi.mocked(fetchYcAvailableBalance).mockResolvedValue(1)
    const rate = 1355.96793609
    vi.mocked(submitYcSend).mockImplementation(
      async (args) => directSendResponse(Number(args.settlementCryptoAmount ?? 0), rate) as never,
    )

    const locked = await lockYcBalancePayoutSend({
      userId: "user-1",
      customerUID: "user-1",
      recipient,
      receiveFiatAmount: 2000,
      sourceBalanceCurrency: "USD",
      userTurnkeyAddress: "user-wallet",
      senderProfile: { residenceCountry: "NG" },
    })

    expect(locked.settlementMode).toBe("direct_crypto")
    for (const call of vi.mocked(submitYcSend).mock.calls) {
      expect(call[0].directSettlement).not.toBe(false)
    }
  })
})
