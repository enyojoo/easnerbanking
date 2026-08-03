import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcPayInLeg: vi.fn(),
}))

vi.mock("@/lib/yellowcard/channels", () => ({
  listYellowcardChannels: vi.fn(),
  toYcChannelType: (rail: string) => rail === "mobile_money" ? "momo" : "bank",
  readYcResponseChannelId: (response: Record<string, unknown>) =>
    String(response?.channelId ?? response?.channel_id ?? "").trim() || null,
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
  hydrateYcReceiveBankInfo: vi.fn(async (receive: Record<string, unknown>) => receive),
  resolveYcBankInfoName: (bankInfo: Record<string, unknown> | null | undefined) => {
    if (!bankInfo || typeof bankInfo !== "object") return ""
    for (const key of ["name", "bankName", "bank_name"]) {
      const value = String(bankInfo[key] ?? "").trim()
      if (value) return value
    }
    return ""
  },
}))

import { computeYcFundBalancePricing } from "@easner/shared"
import { listYcRates, findYcPayInLeg } from "@/lib/fx/yc-rates"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { findReusableYcTransfer } from "@/lib/yellowcard/quote-key"
import { hydrateYcReceiveBankInfo, submitYcReceive } from "@/lib/yellowcard/receive-submit"
import {
  confirmFundBalanceOrder,
  FundBalanceQuoteServiceError,
} from "./fund-balance-quote-service"

function makeAdmin() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
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
    expect(submitYcReceive).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "bank" }),
    )
    const transferInsert = admin.chain.insert.mock.calls.find(
      (call) => call[0]?.mode === "fund_balance",
    )?.[0]
    expect(transferInsert?.leg1_channel_id).toBe("ch-1")
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
    const submitted = vi.mocked(submitYcReceive).mock.calls[0]?.[0]?.localAmount ?? 0
    expect(submitted).toBeGreaterThan(133825)
    expect(result.localPayIn).toBe(submitted)
  })

  it("uses submitted local pay-in when YC POST /receive omits locked amount fields", async () => {
    vi.mocked(submitYcReceive).mockImplementation(async (input) => ({
      id: "yc-ng-bank",
      settlementInfo: { cryptoAmount: 31.05538504 },
      networkFeeAmountUSD: 0,
      serviceFeeAmountUSD: 0.31,
    }))

    const admin = makeAdmin()
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      currency: "NGN",
      country: "NG",
      usdCredit: 30,
    })

    const submitted = vi.mocked(submitYcReceive).mock.calls[0]?.[0]?.localAmount ?? 0
    expect(result.localPayIn).toBe(submitted)
    expect(result.localPayIn).toBeGreaterThan(4000)

    const txInsert = admin.chain.insert.mock.calls.find((call) => call[0]?.provider === "yellowcard")?.[0]
    expect(txInsert?.metadata?.local_pay_in).toBe(submitted)
    expect(txInsert?.metadata?.deposit_review?.local_pay_in).toBe(submitted)
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

  it("persists omnibus_in_expected when YC receive is sufficient", async () => {
    vi.mocked(submitYcReceive).mockImplementation(async () => {
      const pricing = computeYcFundBalancePricing({
        usdCredit: 2000,
        customerSellRate: 132.5,
        ycSellRate: 130,
        receiveLeg: { cryptoAmountUsd: 2050 },
      })
      return {
        id: "yc-2",
        channel_id: "routed-bank",
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
    expect(txInsert?.metadata?.margin_amount).toBeUndefined()
    expect(txInsert?.metadata?.margin_capture_mode).toBe("fee_wallet_omnibus")

    const transferInsert = admin.chain.insert.mock.calls.find(
      (call) => call[0]?.mode === "fund_balance",
    )?.[0]
    expect(transferInsert?.metadata?.omnibus_in_expected).toBe(2050)
    expect(transferInsert?.leg1_channel_id).toBe("routed-bank")
    expect(transferInsert?.quoted_pay_in).toBeGreaterThan(0)
  })

  it("wraps YC receive failures in FundBalanceQuoteServiceError", async () => {
    vi.mocked(submitYcReceive).mockRejectedValue(new Error("YC rejected"))

    const admin = makeAdmin()

    await expect(
      confirmFundBalanceOrder({ ...baseCtx, admin }),
    ).rejects.toBeInstanceOf(FundBalanceQuoteServiceError)
  })

  it("reuses locked transfer without re-solving padded local into usdCredit", async () => {
    vi.mocked(findReusableYcTransfer).mockResolvedValue({
      id: "tr-reuse",
      transaction_id: "tx-reuse",
      quoted_pay_in: 4403.78,
      quoted_receive: 3,
      customer_rate: 1411.0552763819,
      leg1_sequence_id: "yc_fb_reuse",
      leg1_yc_id: "yc-reuse",
      bank_info: { accountName: "Samuel Enyojo Odiba", accountNumber: "3457074823" },
      settlement_info: { cryptoAmount: 3.03 },
      metadata: {
        quote_key: "quote-key-1",
        usd_credit: 3,
        processing_fee: 0.03,
        yc_leg_fees_usd: 0.09,
        yc_channel_fee_usd: 0.09,
        omnibus_in_expected: 3.03,
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    vi.mocked(hydrateYcReceiveBankInfo).mockResolvedValue({
      id: "yc-reuse",
      bankInfo: {
        accountName: "Samuel Enyojo Odiba",
        accountNumber: "3457074823",
        bankName: "Nuvion MFB",
      },
    })

    const admin = makeAdmin()
    admin.chain.maybeSingle.mockResolvedValue({
      data: { easner_transaction_id: "ETID33828323" },
    })

    const result = await confirmFundBalanceOrder({
      ...baseCtx,
      admin,
      currency: "NGN",
      country: "NG",
      usdCredit: 3,
    })

    expect(submitYcReceive).not.toHaveBeenCalled()
    expect(result.usdCredit).toBe(3)
    expect(result.creditOrReceiveAmount).toBe(3)
    expect(result.localPayIn).toBe(4403.78)
    expect(result.processingFee).toBe(0.03)
    expect(result.ycLegFeesUsd).toBe(0.09)
    expect(result.bankInfo?.bankName).toBe("Nuvion MFB")
    expect(hydrateYcReceiveBankInfo).toHaveBeenCalled()
  })
})
