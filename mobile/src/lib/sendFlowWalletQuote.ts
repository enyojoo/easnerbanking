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
  if (stashed.quotePhase === 'preview') return false
  if (stashedMeta.recipientId.trim() !== input.recipientId.trim()) return false
  if (stashedMeta.amountEntryMode !== input.amountEntryMode) return false
  if (stashedMeta.receiveCurrency.trim().toUpperCase() !== input.receiveCurrency.trim().toUpperCase()) {
    return false
  }
  return entryAmountsMatch(stashedMeta.entryAmount, input.entryAmount)
}

let inflightQuote: Promise<WalletSendQuote | null> | null = null
let inflightQuoteKey = ''
let inflightConfirm: Promise<WalletSendQuote | null> | null = null
let inflightConfirmKey = ''
let lastWalletQuoteError: string | null = null

function quoteMetaKey(meta: SendWalletQuoteStashMeta): string {
  return [meta.recipientId, meta.amountEntryMode, meta.entryAmount, meta.receiveCurrency].join('|')
}

export function peekLastWalletQuoteError(): string | null {
  return lastWalletQuoteError
}

export async function ensureSendWalletQuoteStashed(
  fetchQuote: () => Promise<WalletSendQuote>,
  meta: SendWalletQuoteStashMeta,
): Promise<WalletSendQuote | null> {
  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastWalletQuoteError = null
  inflightQuote = fetchQuote()
    .then((quote) => {
      lastWalletQuoteError = null
      return { ...quote, quotePhase: 'preview' as const }
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

export async function ensureSendWalletOrderConfirmed(
  fetchQuote: () => Promise<WalletSendQuote>,
  fetchConfirm: (formSessionId: string) => Promise<WalletSendQuote>,
  meta: SendWalletQuoteStashMeta,
): Promise<WalletSendQuote | null> {
  if (isStashedWalletQuoteFresh(meta)) return peekSendWalletQuote()

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastWalletQuoteError = null
  inflightConfirm = (async () => {
    const preview = await ensureSendWalletQuoteStashed(fetchQuote, meta)
    if (!preview?.formSessionId) return null
    try {
      const locked = await fetchConfirm(preview.formSessionId)
      const quote = { ...locked, quotePhase: 'locked' as const }
      stashSendWalletQuote(quote, meta)
      return quote
    } catch (err) {
      lastWalletQuoteError = err instanceof Error ? err.message : 'confirm_failed'
      return null
    }
  })().finally(() => {
    inflightConfirm = null
    inflightConfirmKey = ''
  })

  return inflightConfirm
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
  processingFee: number
  displayChannelCost: number
  networkFee: number
  totalDebited: number
  customerRate: number
  executionModel?: WalletSendQuote["executionModel"]
} {
  const processingFee = quote.processingFee ?? quote.marginAmount
  const displayChannelCost = quote.displayChannelCost ?? quote.channelCost
  return {
    youSendAmount: quote.sendAmount,
    // `exchangeFee` feeds the combined Processing fee row — use the footing display channel.
    exchangeFee: displayChannelCost,
    // `marginAmount` here is what the screen renders as the Easner processing fee leg.
    marginAmount: processingFee,
    processingFee,
    displayChannelCost,
    networkFee: quote.networkFee,
    totalDebited: quote.totalDebited,
    customerRate: quote.customerRate,
    executionModel: quote.executionModel,
  }
}
