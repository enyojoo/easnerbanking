import { describe, expect, it } from "vitest"
import { isCompleteLockedPayoutQuote } from "./payout-quote-completion"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"

function sampleQuote(overrides?: Partial<PayoutQuoteResult>): PayoutQuoteResult {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  return {
    receiveAmount: 1000,
    receiveCurrency: "NGN",
    customerPrincipal: 1,
    sendAmount: 1,
    sendCurrency: "USD",
    totalDebited: 1,
    channelCost: 0,
    marginAmount: 0,
    settlement: {
      totalFee: 0,
      feeCurrency: "USD",
      cryptoAuthorizedAmount: "1",
      cryptoFloor: "1",
      cryptoSendAmount: "1",
      cryptoCurrency: "USDC",
      sessionId: "session-a",
      customerRate: 1000,
      marginCaptureMode: "surplus_send",
      channelCost: 0,
      marginAmount: 0,
      customerPrincipal: 1,
    },
    noah: {
      totalFee: 0,
      cryptoAuthorizedAmount: "1",
      noahFloor: "1",
      noahSendAmount: "1",
      cryptoCurrency: "USDC",
      formSessionId: "session-a",
    },
    easner: {
      quoteId: "q-1",
      expiresAt,
      providerRate: 1000,
      effectiveRate: 1000,
      destinationAmount: 1000,
      fxMarkupBps: 0,
      payinFeeAmount: 0,
      payoutFeeAmount: 0,
      totalFeeAmount: 0,
      sourceAmount: 1,
      sourceCurrency: "USD",
      destinationCurrency: "NGN",
    },
    pricingQuoteId: "q-1",
    expiresAt,
    quotePhase: "locked",
    lockId: "lock-1",
    ...overrides,
  }
}

describe("isCompleteLockedPayoutQuote", () => {
  it("accepts locked quotes with lockId", () => {
    expect(isCompleteLockedPayoutQuote(sampleQuote())).toBe(true)
  })

  it("rejects preview quotes", () => {
    expect(
      isCompleteLockedPayoutQuote(
        sampleQuote({ quotePhase: "preview", requiresConfirm: true, lockId: undefined }),
      ),
    ).toBe(false)
  })

  it("accepts locked YC quotes with sendId", () => {
    expect(
      isCompleteLockedPayoutQuote(
        sampleQuote({
          lockId: undefined,
          provider: "yellowcard",
          yc: {
            sequenceId: "seq-1",
            sendId: "send-1",
            channelId: "ch-1",
            cryptoAmount: 1,
          },
        }),
      ),
    ).toBe(true)
  })

  it("requires a live Grid quoteId on locked Grid review quotes", () => {
    expect(
      isCompleteLockedPayoutQuote(
        sampleQuote({
          lockId: "lock-grid-1",
          provider: "grid",
          grid: {
            quoteId: "",
            sequenceId: "grid_preview_1",
            customerId: "",
            externalAccountId: "",
            cryptoAmount: 1,
          },
        }),
      ),
    ).toBe(false)
    expect(
      isCompleteLockedPayoutQuote(
        sampleQuote({
          lockId: "lock-grid-1",
          provider: "grid",
          grid: {
            quoteId: "Quote:live",
            sequenceId: "grid_quote_Quote:live",
            customerId: "Customer:1",
            externalAccountId: "ExternalAccount:1",
            cryptoAmount: 1.5,
          },
        }),
      ),
    ).toBe(true)
  })

  it("rejects expired quotes", () => {
    expect(
      isCompleteLockedPayoutQuote(
        sampleQuote({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).toBe(false)
  })
})
