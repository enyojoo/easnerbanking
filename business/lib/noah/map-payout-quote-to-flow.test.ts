import { describe, expect, it } from "vitest"
import type { PayoutQuoteResult } from "./payout-quote"
import {
  isPayoutQuoteFresh,
  mapPayoutQuoteToFlowState,
} from "./map-payout-quote-to-flow"
import type { SendFlowState } from "../send-flow-session"

function lockedQuote(): PayoutQuoteResult {
  return {
    requestedReceiveAmount: 2000,
    receiveAmount: 2010.25,
    receiveCurrency: "NGN",
    customerPrincipal: 1.47,
    sendAmount: 1.47,
    sendCurrency: "USD",
    totalDebited: 1.5,
    channelCost: 0.01,
    marginAmount: 0.01,
    processingFee: 0.01,
    displayChannelCost: 0.01,
    settlement: {
      totalFee: 0.01,
      feeCurrency: "USD",
      cryptoAuthorizedAmount: "1.475",
      cryptoFloor: "1.475",
      cryptoSendAmount: "1.475",
      cryptoCurrency: "USDC",
      sessionId: "yc-sequence",
      marginCaptureMode: "fee_wallet_deferred",
      channelCost: 0.01,
      marginAmount: 0.01,
      customerPrincipal: 1.47,
    },
    noah: {
      totalFee: 0.01,
      feeCurrency: "USD",
      cryptoAuthorizedAmount: "1.475",
      noahFloor: "1.475",
      noahSendAmount: "1.475",
      cryptoCurrency: "USDC",
      formSessionId: "yc-sequence",
      marginCaptureMode: "fee_wallet_deferred",
      channelCost: 0.01,
      marginAmount: 0.01,
      customerPrincipal: 1.47,
    },
    easner: {
      quoteId: "yc-sequence",
      expiresAt: "2099-01-01T00:00:00.000Z",
      providerRate: 1365,
      effectiveRate: 1365,
      destinationAmount: 2010.25,
      fxMarkupBps: 50,
      payinFeeAmount: 0,
      payoutFeeAmount: 0.01,
      totalFeeAmount: 0.02,
      sourceAmount: 1.47,
      sourceCurrency: "USD",
      destinationCurrency: "NGN",
      pricingTotals: {
        total_easner_fee: 0.01,
        total_user_fee: 0.02,
        total_recipient_amount: 2010.25,
      },
    },
    pricingQuoteId: "yc-sequence",
    expiresAt: "2099-01-01T00:00:00.000Z",
    executionModel: "turnkey_workflow",
    provider: "yellowcard",
    quotePhase: "locked",
    requiresConfirm: false,
    lockId: "lock-1",
  }
}

describe("YC payout quote flow mapping", () => {
  it("keeps the requested receive amount on Review transfer", () => {
    const state = {
      recipient: { id: "recipient-1" },
      // Simulate a persisted session contaminated by the former surplus-inclusive mapping.
      amount: 2010.25,
      receiveCurrency: "NGN",
      sendAmount: 0,
      sendCurrency: "USD",
      paymentMethod: "balance",
      note: "",
      transactionId: "ETID1",
    } as SendFlowState

    const mapped = mapPayoutQuoteToFlowState(state, lockedQuote())
    expect(mapped.amount).toBe(2000)
    expect(mapped.payoutQuote?.receiveAmount).toBe(2010.25)
    expect(mapped.payoutQuote?.requestedReceiveAmount).toBe(2000)
    expect(isPayoutQuoteFresh(mapped.payoutQuote, 2000, "recipient-1")).toBe(true)
  })
})
