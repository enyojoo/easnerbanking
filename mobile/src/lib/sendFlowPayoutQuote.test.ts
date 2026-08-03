import { describe, expect, it, beforeEach } from 'vitest'
import type { PayoutQuote } from './noahService'
import {
  clearSendPayoutQuote,
  isCompletePayoutQuote,
  isPayoutSessionReadyForExecute,
  isStashedPayoutQuoteFresh,
  isStashedPayoutQuotePreviewFresh,
  stashSendPayoutQuote,
  stashSendPayoutQuotePreview,
  payoutCustomerFacingReceiveAmount,
  payoutDisplayAmountsFromQuote,
  payoutRequestedReceiveAmount,
  payoutPrepareSessionFromQuote,
} from './sendFlowPayoutQuote'

function sampleQuote(overrides?: Partial<PayoutQuote>): PayoutQuote {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const base = {
    receiveAmount: 1000,
    receiveCurrency: 'NGN',
    customerPrincipal: 1,
    sendAmount: 1,
    sendCurrency: 'USD',
    totalDebited: 1,
    channelCost: 0,
    marginAmount: 0,
    settlement: {
      totalFee: 0,
      feeCurrency: 'USD',
      cryptoAuthorizedAmount: '1',
      cryptoFloor: '1',
      cryptoSendAmount: '1',
      cryptoCurrency: 'USDC_TEST',
      sessionId: 'session-a',
      customerRate: 1000,
      marginCaptureMode: 'surplus_send' as const,
      channelCost: 0,
      marginAmount: 0,
      customerPrincipal: 1,
    },
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
    quotePhase: 'locked',
    lockId: 'lock-1',
  }
  return { ...base, ...overrides }
}

describe('sendFlowPayoutQuote stash', () => {
  beforeEach(() => {
    clearSendPayoutQuote()
  })

  it('keeps Recipient amount anchored to the requested amount when YC locks a surplus', () => {
    const quote = sampleQuote({
      provider: 'yellowcard',
      requestedReceiveAmount: 2000,
      receiveAmount: 2011.72,
      yc: {
        sequenceId: 'yc_quote_dfcd3d26',
        sendId: 'yc-send-1',
        channelId: 'yc-channel-1',
        cryptoAmount: 1.475,
        recipientLocalAmount: 2011.72,
        recipientSurplusLocal: 11.72,
        payoutQuantumLocal: 13.59,
      },
    })

    expect(payoutRequestedReceiveAmount(quote)).toBe(2000)
  })

  it('uses the server-provided customer display amount without changing actual receiveAmount', () => {
    const quote = sampleQuote({
      provider: 'yellowcard',
      requestedReceiveAmount: 2000,
      displayReceiveAmount: 2000,
      receiveAmount: 2011.72,
      customerPrincipal: 1.472563,
      totalDebited: 1.497089,
      displayProcessingFee: 0.024526,
    })

    expect(payoutCustomerFacingReceiveAmount(quote)).toBe(2000)
    expect(quote.receiveAmount).toBe(2011.72)
    expect(payoutDisplayAmountsFromQuote(quote)).toMatchObject({
      actualReceiveAmount: 2011.72,
      recipientGetsAmount: 2000,
      displayProcessingFee: 0.03,
    })
  })

  it('falls back to the actual receive amount for legacy quotes without a requested amount', () => {
    const quote = sampleQuote({
      provider: 'yellowcard',
      requestedReceiveAmount: undefined,
      receiveAmount: 2011.72,
    })
    expect(payoutRequestedReceiveAmount(quote)).toBe(2011.72)
    expect(payoutCustomerFacingReceiveAmount(quote)).toBe(2011.72)
  })

  it('keeps non-YC display semantics on the provider quoted amount', () => {
    const quote = sampleQuote({
      provider: 'noah',
      requestedReceiveAmount: 2000,
      receiveAmount: 2011.72,
    })
    expect(payoutCustomerFacingReceiveAmount(quote)).toBe(2011.72)
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

  it('requires Yellowcard lockId (or ycSendId) for PIN after lock-on-review', () => {
    const preview = sampleQuote({
      provider: 'yellowcard',
      quotePhase: 'preview',
      requiresConfirm: true,
      lockId: undefined,
      yc: { sequenceId: 'yc_preview_abc', channelId: 'ch-1', cryptoAmount: 1.5 },
      settlement: {
        ...sampleQuote().settlement,
        sessionId: 'yc_preview_abc',
      },
    })
    expect(isPayoutSessionReadyForExecute(payoutPrepareSessionFromQuote(preview, 'recipient-a'), 'recipient-a')).toBe(
      false,
    )

    const locked = sampleQuote({
      provider: 'yellowcard',
      quotePhase: 'locked',
      requiresConfirm: false,
      lockId: 'lock-1',
      yc: { sequenceId: 'yc_locked_abc', sendId: 'send-1', channelId: 'ch-1', cryptoAmount: 1.5 },
      settlement: {
        ...sampleQuote().settlement,
        sessionId: 'yc_locked_abc',
      },
    })
    expect(isPayoutSessionReadyForExecute(payoutPrepareSessionFromQuote(locked, 'recipient-a'), 'recipient-a')).toBe(
      true,
    )
  })

  it('rejects Grid and Yellowcard preview quotes until confirm lock', () => {
    expect(
      isCompletePayoutQuote(
        sampleQuote({
          provider: 'grid',
          quotePhase: 'preview',
          requiresConfirm: true,
          lockId: undefined,
          settlement: {
            ...sampleQuote().settlement,
            sessionId: 'grid_preview_abc',
          },
        }),
      ),
    ).toBe(false)
    expect(
      isCompletePayoutQuote(
        sampleQuote({
          provider: 'yellowcard',
          quotePhase: 'preview',
          requiresConfirm: true,
          lockId: undefined,
          yc: { sequenceId: 'yc_preview_abc', channelId: 'ch-1', cryptoAmount: 1.5 },
          settlement: {
            ...sampleQuote().settlement,
            sessionId: 'yc_preview_abc',
          },
        }),
      ),
    ).toBe(false)
  })

  it('rejects incomplete quotes', () => {
    expect(isCompletePayoutQuote(null)).toBe(false)
    expect(
      isCompletePayoutQuote(
        sampleQuote({
          quotePhase: 'preview',
          lockId: undefined,
        }),
      ),
    ).toBe(false)
    expect(
      isCompletePayoutQuote(
        sampleQuote({
          easner: undefined as unknown as PayoutQuote['easner'],
        }),
      ),
    ).toBe(false)
    expect(
      isCompletePayoutQuote(
        sampleQuote({
          easner: { ...sampleQuote().easner, providerRate: 0 },
        }),
      ),
    ).toBe(false)
  })

  it('stores preview quotes separately from locked stash', () => {
    const meta = {
      recipientId: 'recipient-a',
      amountEntryMode: 'receive' as const,
      entryAmount: 1000,
      receiveCurrency: 'NGN',
    }
    stashSendPayoutQuotePreview(
      sampleQuote({
        quotePhase: 'preview',
        lockId: undefined,
        settlement: {
          ...sampleQuote().settlement,
          sessionId: 'preview-session',
        },
      }),
      meta,
    )

    expect(isStashedPayoutQuotePreviewFresh(meta)).toBe(true)
    expect(isStashedPayoutQuoteFresh(meta)).toBe(false)

    stashSendPayoutQuote(sampleQuote(), meta)
    expect(isStashedPayoutQuoteFresh(meta)).toBe(true)
  })
})
