import { describe, expect, it, beforeEach } from 'vitest'
import type { WalletSendQuote } from './noahService'
import {
  clearSendWalletQuote,
  isStashedWalletQuoteFresh,
  stashSendWalletQuote,
} from './sendFlowWalletQuote'

function sampleQuote(overrides?: Partial<WalletSendQuote>): WalletSendQuote {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  return {
    receiveAmount: 100,
    receiveCurrency: 'USDC',
    receiveNetwork: 'Solana',
    sendAmount: 100,
    sendCurrency: 'USD',
    totalDebited: 100,
    marginAmount: 0,
    channelCost: 0,
    networkFee: 0,
    rate: 1,
    customerRate: 1,
    lifiMid: 1,
    expiresAt,
    formSessionId: 'wallet-session-a',
    pricingQuoteId: '',
    executionModel: 'direct_turnkey',
    wallet: {
      cryptoAuthorizedAmount: '100',
      lifiFloor: '100',
    },
    ...overrides,
  }
}

describe('sendFlowWalletQuote stash', () => {
  beforeEach(() => {
    clearSendWalletQuote()
  })

  it('reuses stash only for the same recipient and amount', () => {
    stashSendWalletQuote(sampleQuote(), {
      recipientId: 'recipient-a',
      amountEntryMode: 'receive',
      entryAmount: 100,
      receiveCurrency: 'USDC',
    })

    expect(
      isStashedWalletQuoteFresh({
        recipientId: 'recipient-a',
        amountEntryMode: 'receive',
        entryAmount: 100,
        receiveCurrency: 'USDC',
      }),
    ).toBe(true)

    expect(
      isStashedWalletQuoteFresh({
        recipientId: 'recipient-b',
        amountEntryMode: 'receive',
        entryAmount: 100,
        receiveCurrency: 'USDC',
      }),
    ).toBe(false)
  })
})
