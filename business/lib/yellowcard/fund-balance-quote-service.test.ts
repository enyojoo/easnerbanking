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
      yc_sell: 130,
    } as never)
    vi.mocked(isYcLocalPayInEnabledForCorridor).mockResolvedValue(true)
    vi.mocked(listYellowcardChannels).mockResolvedValue([])
    vi.mocked(findYcReceiveChannel).mockReturnValue({ id: "ch-1" } as never)
    vi.mocked(validateFundBalancePayInAmountLimits).mockResolvedValue({ ok: true })
    vi.mocked(findReusableYcTransfer).mockResolvedValue(null)
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
