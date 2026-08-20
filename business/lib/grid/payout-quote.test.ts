import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  computeYcBalancePayoutPricingBeforeSend,
} from "@easner/shared"

vi.mock("./quote-funding", () => ({
  retrieveGridQuote: vi.fn(),
  hydrateGridQuotePaymentInstructions: vi.fn(async (quote: unknown) => quote),
  resolveGridQuoteFundingAddress: vi.fn(() => "So1anaFunding111"),
}))

vi.mock("./http", () => ({
  gridFetch: vi.fn(),
}))

vi.mock("./idempotency", () => ({
  buildGridIdempotencyKey: (key: string) => key,
}))

import { retrieveGridQuote } from "./quote-funding"
import { gridFetch } from "./http"
import {
  applyLiveGridQuoteToLockedPricing,
  buildGridEasnerFeeSlice,
  computeGridLockedBalancePayoutPricing,
  ensureFreshGridBalancePayoutQuote,
} from "./payout-quote"

const receiveAmount = 2000
const customerPrincipal = 1.444472
const customerRate = receiveAmount / customerPrincipal
const gridSendingUsd = 1.501175

describe("computeGridLockedBalancePayoutPricing", () => {
  it("debits Grid totalSendingAmount plus FX margin and 1% – no YC 2% pad", () => {
    const locked = computeGridLockedBalancePayoutPricing({
      receiveAmount,
      customerRate,
      gridSendingUsd,
      gridFeesUsd: 0.015,
      processingFeeBps: 100,
    })
    const padded = computeYcBalancePayoutPricingBeforeSend({
      receiveAmount,
      customerRate,
      provisionalCryptoUsd: gridSendingUsd,
      processingFeeBps: 100,
    })

    expect(locked.ycFloorUsd).toBe(gridSendingUsd)
    expect(locked.processingFee).toBeCloseTo(customerPrincipal * 0.01, 6)
    expect(locked.channelCost).toBe(0.015)
    expect(locked.totalDebited).toBeCloseTo(
      gridSendingUsd + locked.marginAmount + locked.processingFee,
      6,
    )
    expect(locked.totalDebited).toBeLessThan(padded.totalDebited)
  })
})

describe("buildGridEasnerFeeSlice", () => {
  it("includes the 1% processing fee in total_user_fee", () => {
    const pricing = computeGridLockedBalancePayoutPricing({
      receiveAmount,
      customerRate,
      gridSendingUsd,
      gridFeesUsd: 0.015,
      processingFeeBps: 100,
    })
    const easner = buildGridEasnerFeeSlice({
      quoteId: "grid_quote_q1",
      expiresAt: "2026-08-19T13:47:54.000Z",
      customerRate,
      receiveAmount,
      receiveCurrency: "NGN",
      sourceCurrency: "USD",
      pricing,
    })
    expect(easner.fxMarkupBps).toBe(50)
    expect(easner.pricingTotals.total_easner_fee).toBe(pricing.marginAmount)
    expect(easner.totalFeeAmount).toBeCloseTo(
      pricing.marginAmount + pricing.processingFee + pricing.channelCost,
      6,
    )
    expect(easner.payoutFeeAmount).toBeCloseTo(pricing.processingFee + pricing.channelCost, 6)
  })
})

describe("applyLiveGridQuoteToLockedPricing", () => {
  it("uses Grid USDC 6dp sending amount and never lowers the original debit", () => {
    const quote = {
      id: "Quote:live",
      totalSendingAmount: 1_501_175,
      sendingCurrency: { code: "USDC", decimals: 6 },
      rateDetails: {
        gridApiFixedFee: 10_000,
        gridApiVariableFeeAmount: 5_000,
      },
    }
    const applied = applyLiveGridQuoteToLockedPricing({
      quote,
      receiveAmount,
      customerRate,
      processingFeeBps: 100,
      fallbackSendingUsd: 1.44,
      originalTotalDebited: 1.6,
    })
    expect(applied.cryptoAmount).toBe(1.501175)
    expect(applied.pricing.totalDebited).toBeGreaterThanOrEqual(1.6)
  })
})

describe("ensureFreshGridBalancePayoutQuote", () => {
  beforeEach(() => {
    vi.mocked(retrieveGridQuote).mockReset()
    vi.mocked(gridFetch).mockReset()
  })

  it("posts a new quote when GET fails, using a refresh idempotency key", async () => {
    vi.mocked(retrieveGridQuote).mockRejectedValue(new Error("not found"))
    vi.mocked(gridFetch).mockResolvedValue({
      id: "Quote:fresh",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      totalSendingAmount: 1_501_175,
      sendingCurrency: { code: "USDC", decimals: 6 },
    })

    const result = await ensureFreshGridBalancePayoutQuote({
      quoteId: "Quote:old",
      customerId: "Customer:c1",
      externalAccountId: "ExternalAccount:e1",
      receiveCurrency: "NGN",
      receiveAmount,
      customerRate,
      processingFeeBps: 100,
      originalTotalDebited: 1.55,
      originalCryptoAmount: 1.501175,
      originalFundingAddress: "So1anaFunding111",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.refreshed).toBe(true)
    expect(result.quoteId).toBe("Quote:fresh")
    expect(result.cryptoAmount).toBe(1.501175)
    expect(gridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/quotes",
        idempotencyKey: "grid_quote_refresh_Quote:old",
      }),
    )
  })

  it("does not POST when the live quote still has time left", async () => {
    vi.mocked(retrieveGridQuote).mockResolvedValue({
      id: "Quote:old",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      totalSendingAmount: 1_501_175,
      sendingCurrency: { code: "USDC", decimals: 6 },
    })

    const result = await ensureFreshGridBalancePayoutQuote({
      quoteId: "Quote:old",
      customerId: "Customer:c1",
      externalAccountId: "ExternalAccount:e1",
      receiveCurrency: "NGN",
      receiveAmount,
      customerRate,
      processingFeeBps: 100,
      originalTotalDebited: 1.55,
      originalCryptoAmount: 1.501175,
      originalFundingAddress: "So1anaFunding111",
    })

    expect(result.ok).toBe(true)
    expect(gridFetch).not.toHaveBeenCalled()
  })

  it("keeps office 0 FX + 0 processing when refreshing the Grid quote", async () => {
    vi.mocked(retrieveGridQuote).mockRejectedValue(new Error("expired"))
    vi.mocked(gridFetch).mockResolvedValue({
      id: "Quote:fresh",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      totalSendingAmount: 1_501_175,
      sendingCurrency: { code: "USDC", decimals: 6 },
    })

    const result = await ensureFreshGridBalancePayoutQuote({
      quoteId: "Quote:old",
      customerId: "Customer:c1",
      externalAccountId: "ExternalAccount:e1",
      receiveCurrency: "NGN",
      receiveAmount,
      customerRate,
      processingFeeBps: 0,
      originalTotalDebited: 1.501175,
      originalCryptoAmount: 1.501175,
      originalFundingAddress: "So1anaFunding111",
      originalMarginAmount: 0,
      originalProcessingFee: 0,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cryptoAmount).toBe(1.501175)
    expect(result.totalDebited).toBe(1.501175)
  })
})
