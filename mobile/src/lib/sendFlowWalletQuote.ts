import type { WalletSendQuote } from './noahService'

export type SendWalletQuoteStashMeta = {
  recipientId: string
  amountEntryMode: 'send' | 'receive'
  entryAmount: number
  receiveCurrency: string
}

let stashed: WalletSendQuote | null = null
let stashedMeta: SendWalletQuoteStashMeta | null = null

export function stashSendWalletQuote(quote: WalletSendQuote, meta: SendWalletQuoteStashMeta): void {
  stashed = quote
  stashedMeta = meta
}

export function peekSendWalletQuote(): WalletSendQuote | null {
  return stashed
}

export function clearSendWalletQuote(): void {
  stashed = null
  stashedMeta = null
}

function entryAmountsMatch(a: number, b: number): boolean {
  return Math.round(a * 100) / 100 === Math.round(b * 100) / 100
}

export function isStashedWalletQuoteFresh(input: SendWalletQuoteStashMeta): boolean {
  if (!stashed?.expiresAt || !stashed.formSessionId || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashedMeta.recipientId.trim() !== input.recipientId.trim()) return false
  if (stashedMeta.amountEntryMode !== input.amountEntryMode) return false
  if (stashedMeta.receiveCurrency.trim().toUpperCase() !== input.receiveCurrency.trim().toUpperCase()) {
    return false
  }
  return entryAmountsMatch(stashedMeta.entryAmount, input.entryAmount)
}

let inflightQuote: Promise<WalletSendQuote | null> | null = null
let inflightQuoteKey = ''
let lastWalletQuoteError: string | null = null

export function peekLastWalletQuoteError(): string | null {
  return lastWalletQuoteError
}

export async function ensureSendWalletQuoteStashed(
  fetchQuote: () => Promise<WalletSendQuote>,
  meta: SendWalletQuoteStashMeta,
): Promise<WalletSendQuote | null> {
  if (isStashedWalletQuoteFresh(meta)) return peekSendWalletQuote()

  const key = [meta.recipientId, meta.amountEntryMode, meta.entryAmount, meta.receiveCurrency].join('|')
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastWalletQuoteError = null
  inflightQuote = fetchQuote()
    .then((quote) => {
      stashSendWalletQuote(quote, meta)
      lastWalletQuoteError = null
      return quote
    })
    .catch((err) => {
      lastWalletQuoteError = err instanceof Error ? err.message : 'quote_failed'
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

export type WalletPrepareSession = {
  recipientId: string
  formSessionId: string
  cryptoAuthorizedAmount: string
  cryptoCurrency: string
  totalDebited?: string
  marginAmount?: string
  customerRate?: number
  lifiMid?: number
  executionModel?: 'direct_turnkey' | 'lifi_bridge'
}

export function walletPrepareSessionFromQuote(
  quote: WalletSendQuote,
  recipientId: string,
): WalletPrepareSession {
  return {
    recipientId,
    formSessionId: quote.formSessionId,
    cryptoAuthorizedAmount: quote.wallet.cryptoAuthorizedAmount,
    cryptoCurrency: quote.sendCurrency,
    totalDebited: String(quote.totalDebited),
    marginAmount: String(quote.marginAmount),
    customerRate: quote.customerRate,
    lifiMid: quote.lifiMid,
    executionModel: quote.executionModel,
  }
}

export function walletDisplayAmountsFromQuote(quote: WalletSendQuote): {
  youSendAmount: number
  exchangeFee: number
  marginAmount: number
  networkFee: number
  totalDebited: number
  customerRate: number
  executionModel?: WalletSendQuote["executionModel"]
} {
  return {
    youSendAmount: quote.sendAmount,
    exchangeFee: quote.channelCost,
    marginAmount: quote.marginAmount,
    networkFee: quote.networkFee,
    totalDebited: quote.totalDebited,
    customerRate: quote.customerRate,
    executionModel: quote.executionModel,
  }
}
