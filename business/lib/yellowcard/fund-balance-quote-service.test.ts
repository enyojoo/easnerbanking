import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcPayInLeg: vi.fn(),
}))

vi.mock("@/lib/yellowcard/channels", () => ({
  listYellowcardChannels: vi.fn(),
}))

vi.mock("@/lib/yellowcard/receive-rails", () => ({
  findYcReceiveChannel: vi.fn(),
}))

vi.mock("@/lib/yellowcard/yc-receive-gate", () => ({
  isYcLocalPayInEnabledForCorridor: vi.fn(),
}))

vi.mock("@/lib/deposit-omnibus/config", () => ({
  depositOmnibusSolanaAddressUsd: vi.fn(() => "omnibus-wallet"),
}))

vi.mock("@/lib/yellowcard/kyc-metadata", () => ({
  buildYcKycPersonMetadata: vi.fn(() => ({ name: "Test User" })),
}))

vi.mock("@/lib/transaction-id", () => ({
  generateTransactionId: vi.fn(() => "ETID123"),
}))

vi.mock("@/lib/pay-in-limit-check", () => ({
  validateFundBalancePayInAmountLimits: vi.fn(),
}))

vi.mock("@/lib/yellowcard/quote-key", () => ({
  buildYcQuoteKey: vi.fn(() => "quote-key-1"),
  findReusableYcTransfer: vi.fn(),
}))

vi.mock("@/lib/yellowcard/receive-submit", () => ({
  submitYcReceive: vi.fn(),
}))

import { computeYcFundBalancePricing } from "@easner/shared"
import { listYcRates, findYcPayInLeg } from "@/lib/fx/yc-rates"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { findReusableYcTransfer } from "@/lib/yellowcard/quote-key"
import { submitYcReceive } from "@/lib/yellowcard/receive-submit"
import {
  confirmFundBalanceOrder,
  FundBalanceQuoteServiceError,
} from "./fund-balance-quote-service"

function makeAdmin() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }
  return {
    from: vi.fn(() => chain),
    chain,
  } as unknown as SupabaseClient & { chain: typeof chain }
}

const baseCtx = {
  kycUserId: "user-1",
  businessId: null,
  currency: "KES",
  country: "KE",
  rail: "bank_transfer" as const,
  usdCredit: 2000,
  userRow: { residence_country: "KE" },
}

describe("confirmFundBalanceOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listYcRates).mockResolvedValue([])
    vi.mocked(findYcPayInLeg).mockReturnValue({
      easner_sell: 132.5,
      yc_buy: 130,
    } as never)
    vi.mocked(isYcLocalPayInEnabledForCorridor).mockResolvedValue(true)
    vi.mocked(listYellowcardChannels).mockResolvedValue([])
    vi.mocked(findYcReceiveChannel).mockReturnValue({ id: "ch-1" } as never)
    vi.mocked(validateFundBalancePayInAmountLimits).mockResolvedValue({ ok: true })
    vi.mocked(findReusableYcTransfer).mockResolvedValue(null)
  })

  it("locks bank deposit after retry when YC first quote omits embedded receive fees", async () => {
    vi.mocked(submitYcReceive)
      .mockResolvedValueOnce({
        id: "yc-bank-short",
        localAmount: 341253.75,
        settlementInfo: { cryptoAmount: 2529.14898161 },
        networkFeeAmountUSD: 0,
        serviceFeeAmountUSD: 0,
      })
      .mockResolvedValueOnce({
        id: "yc-bank-ok",
        localAmount: 351500,
        settlementInfo: { cryptoAmount: 2576 },
        networkFeeAmountUSD: 0,
        serviceFeeAmountUSD: 0,
      })

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      usdCredit: 2550,
    })

    expect(result.quotePhase).toBe("locked")
    expect(submitYcReceive).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(submitYcReceive).mock.calls[0]?.[0]
    expect(firstCall?.localAmount).toBeGreaterThan(341253.75)
  })

  it("accepts confirm on one YC call when omnibus is within fund-balance tolerance", async () => {
    vi.mocked(submitYcReceive).mockResolvedValue({
      id: "yc-slop",
      localAmount: 164462,
      settlementInfo: { cryptoAmount: 1211.1089995799998 },
      networkFeeAmountUSD: 0,
      serviceFeeAmountUSD: 0,
    })

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      usdCredit: 1200,
    })

    expect(result.quotePhase).toBe("locked")
    expect(submitYcReceive).toHaveBeenCalledTimes(1)
  })

  it("rejects confirm when YC cryptoAmount cannot fund credit + processing fee", async () => {
    vi.mocked(submitYcReceive).mockResolvedValue({
      id: "yc-1",
      localAmount: 265021.63,
      settlementInfo: { cryptoAmount: 1973.97 },
      networkFeeAmountUSD: 0,
      serviceFeeAmountUSD: 0,
    })

    const admin = makeAdmin()

    await expect(
      confirmFundBalanceOrder({ ...baseCtx, admin }),
    ).rejects.toMatchObject({
      code: "yc_omnibus_below_required",
    })
    expect(submitYcReceive).toHaveBeenCalledTimes(2)
  })

  it("locks on a single YC receive when padded pay-in settles enough crypto", async () => {
    vi.mocked(submitYcReceive).mockImplementation(async (input) => ({
      id: "yc-ok",
      localAmount: input.localAmount,
      settlementInfo: { cryptoAmount: 1010 },
      networkFeeAmountUSD: 0,
      serviceFeeAmountUSD: 0,
    }))

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      usdCredit: 1000,
    })

    expect(result.quotePhase).toBe("locked")
    expect(submitYcReceive).toHaveBeenCalledTimes(1)
    expect(vi.mocked(submitYcReceive).mock.calls[0]?.[0]?.localAmount).toBeGreaterThan(133825)
  })

  it("persists live YC leg fees when POST /receive reports service fee only", async () => {
    vi.mocked(submitYcReceive).mockResolvedValue({
      id: "yc-live-fees",
      localAmount: 2590.01,
      settlementInfo: { cryptoAmount: 1.8250192 },
      networkFeeAmountUSD: 0,
      serviceFeeAmountUSD: 0.02,
    })

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      currency: "NGN",
      country: "NG",
      usdCredit: 1.77,
    })

    const txInsert = admin.chain.insert.mock.calls.find((call) => call[0]?.provider === "yellowcard")?.[0]
    expect(txInsert?.metadata?.yc_leg_fees_usd).toBe(0.02)
    expect(txInsert?.metadata?.display_processing_fee).toBeCloseTo(0.0377, 4)
    expect(txInsert?.metadata?.omnibus_in_expected).toBe(1.8250192)
  })

  it("persists omnibus_in_expected and margin_amount when YC receive is sufficient", async () => {
    vi.mocked(submitYcReceive).mockImplementation(async () => {
      const pricing = computeYcFundBalancePricing({
        usdCredit: 2000,
        customerSellRate: 132.5,
        ycSellRate: 130,
        receiveLeg: { cryptoAmountUsd: 2050 },
      })
      return {
        id: "yc-2",
        localAmount: pricing.localPayIn,
        settlementInfo: { cryptoAmount: 2050 },
        networkFeeAmountUSD: 0,
        serviceFeeAmountUSD: 0,
      }
    })

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await confirmFundBalanceOrder({ ...baseCtx, admin })

    expect(result.quotePhase).toBe("locked")
    const txInsert = admin.chain.insert.mock.calls.find((call) => call[0]?.provider === "yellowcard")?.[0]
    expect(txInsert?.metadata?.omnibus_in_expected).toBe(2050)
    expect(txInsert?.metadata?.margin_amount).toBeGreaterThanOrEqual(0)
    expect(txInsert?.metadata?.margin_capture_mode).toBe("fee_wallet_omnibus")

    const transferInsert = admin.chain.insert.mock.calls.find(
      (call) => call[0]?.mode === "fund_balance",
    )?.[0]
    expect(transferInsert?.metadata?.omnibus_in_expected).toBe(2050)
    expect(transferInsert?.quoted_pay_in).toBeGreaterThan(0)
  })

  it("wraps YC receive failures in FundBalanceQuoteServiceError", async () => {
    vi.mocked(submitYcReceive).mockRejectedValue(new Error("YC rejected"))

    const admin = makeAdmin()

    await expect(
      confirmFundBalanceOrder({ ...baseCtx, admin }),
    ).rejects.toBeInstanceOf(FundBalanceQuoteServiceError)
  })
})
