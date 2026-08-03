import { describe, expect, it } from "vitest"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import { lockedQuoteFromSession, type PayoutLockSessionRow } from "./payout-lock-session"

function lockedYcSession(): PayoutLockSessionRow {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const pricing: PayoutQuoteResult = {
    requestedReceiveAmount: 2000,
    receiveAmount: 2011.72,
    receiveCurrency: "NGN",
    customerPrincipal: 1.472563,
    sendAmount: 1.472563,
    sendCurrency: "USD",
    totalDebited: 1.497089,
    channelCost: 0.002437,
    marginAmount: 0.007363,
    processingFee: 0.014726,
    displayChannelCost: 0.0098,
    settlement: {
      totalFee: 0.002437,
      feeCurrency: "USD",
      cryptoAuthorizedAmount: "1.475",
      cryptoFloor: "1.475",
      cryptoSendAmount: "1.475",
      cryptoCurrency: "USDC",
      sessionId: "yc-quote-1",
      customerRate: 1366.135,
      marginCaptureMode: "fee_wallet_deferred",
      channelCost: 0.002437,
      marginAmount: 0.007363,
      customerPrincipal: 1.472563,
    },
    noah: {
      totalFee: 0.002437,
      feeCurrency: "USD",
      cryptoAuthorizedAmount: "1.475",
      noahFloor: "1.475",
      noahSendAmount: "1.475",
      cryptoCurrency: "USDC",
      formSessionId: "yc-quote-1",
      marginCaptureMode: "fee_wallet_deferred",
      channelCost: 0.002437,
      marginAmount: 0.007363,
      customerPrincipal: 1.472563,
    },
    easner: {
      quoteId: "yc-quote-1",
      expiresAt,
      providerRate: 1366.135,
      effectiveRate: 1366.135,
      destinationAmount: 2011.72,
      fxMarkupBps: 50,
      payinFeeAmount: 0,
      payoutFeeAmount: 0.002437,
      totalFeeAmount: 0.0098,
      sourceAmount: 1.472563,
      sourceCurrency: "USD",
      destinationCurrency: "NGN",
      pricingTotals: {
        total_easner_fee: 0.007363,
        total_user_fee: 0.0098,
        total_recipient_amount: 2011.72,
      },
    },
    pricingQuoteId: "yc-quote-1",
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "yellowcard",
  }

  return {
    id: "lock-1",
    user_id: "user-1",
    business_id: null,
    recipient_id: "recipient-1",
    destination_ref: "recipient:recipient-1",
    provider: "yellowcard",
    quote_key: "quote-key-1",
    status: "locked",
    recipient_snapshot_hash: "snapshot-1",
    pricing_json: pricing,
    provider_payload_json: {},
    expires_at: expiresAt,
  }
}

describe("lockedQuoteFromSession", () => {
  it("exposes the requested target for display without replacing the locked amount", () => {
    const quote = lockedQuoteFromSession(lockedYcSession())

    expect(quote.displayReceiveAmount).toBe(2000)
    expect(quote.requestedReceiveAmount).toBe(2000)
    expect(quote.receiveAmount).toBe(2011.72)
    expect(quote.easner.destinationAmount).toBe(2011.72)
    expect(quote.easner.pricingTotals?.total_recipient_amount).toBe(2011.72)
  })

  it("falls back to the actual amount for legacy quotes without a requested target", () => {
    const row = lockedYcSession()
    row.pricing_json.requestedReceiveAmount = undefined

    expect(lockedQuoteFromSession(row).displayReceiveAmount).toBe(2011.72)
  })
})
