import { describe, expect, it, beforeEach } from 'vitest'
import type { PayoutQuote } from './noahService'
import {
  clearSendPayoutQuote,
  isStashedPayoutQuoteFresh,
  stashSendPayoutQuote,
} from './sendFlowPayoutQuote'

function sampleQuote(overrides?: Partial<PayoutQuote>): PayoutQuote {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  return {
    receiveAmount: 1000,
    receiveCurrency: 'NGN',
    customerPrincipal: 1,
    sendAmount: 1,
    sendCurrency: 'USD',
    totalDebited: 1,
    channelCost: 0,
    marginAmount: 0,
    noah: {
      totalFee: 0,
      cryptoAuthorizedAmount: '1',
      noahFloor: '1',
      noahSendAmount: '1',
      cryptoCurrency: 'USDC_TEST',
      formSessionId: 'session-a',
    },
    easner: {
      quoteId: '',
      expiresAt,
      providerRate: 1000,
      effectiveRate: 1000,
      destinationAmount: 1000,
      fxMarkupBps: 0,
      payinFeeAmount: 0,
      payoutFeeAmount: 0,
      totalFeeAmount: 0,
      sourceAmount: 1,
      sourceCurrency: 'USD',
      destinationCurrency: 'NGN',
    },
    pricingQuoteId: '',
    expiresAt,
    ...overrides,
  }
}

describe('sendFlowPayoutQuote stash', () => {
  beforeEach(() => {
    clearSendPayoutQuote()
  })

  it('reuses stash only for the same recipient and amount', () => {
    stashSendPayoutQuote(sampleQuote(), {
      recipientId: 'recipient-a',
      amountEntryMode: 'receive',
      entryAmount: 1000,
      receiveCurrency: 'NGN',
    })

    expect(
      isStashedPayoutQuoteFresh({
        recipientId: 'recipient-a',
        amountEntryMode: 'receive',
        entryAmount: 1000,
        receiveCurrency: 'NGN',
      }),
    ).toBe(true)

    expect(
      isStashedPayoutQuoteFresh({
        recipientId: 'recipient-b',
        amountEntryMode: 'receive',
        entryAmount: 1000,
        receiveCurrency: 'NGN',
      }),
    ).toBe(false)
  })
})
