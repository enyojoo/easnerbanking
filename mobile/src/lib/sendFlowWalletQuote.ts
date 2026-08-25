import type { WalletSendQuote } from './noahService'

export type SendWalletQuoteStashMeta = {
  recipientId: string
  amountEntryMode: 'send' | 'receive'
  entryAmount: number
  receiveCurrency: string
}

let stashed: WalletSendQuote | null = null
let stashedMeta: SendWalletQuoteStashMeta | null = null
let previewStashed: WalletSendQuote | null = null
let previewStashedMeta: SendWalletQuoteStashMeta | null = null

export function stashSendWalletQuote(quote: WalletSendQuote, meta: SendWalletQuoteStashMeta): void {
  stashed = quote
  stashedMeta = meta
}

export function stashSendWalletQuotePreview(
  quote: WalletSendQuote,
  meta: SendWalletQuoteStashMeta,
): void {
  if (!quote?.formSessionId || !quote.expiresAt) return
  previewStashed = quote
  previewStashedMeta = meta
}

export function peekSendWalletQuote(): WalletSendQuote | null {
  return stashed
}

export function peekSendWalletQuotePreview(): WalletSendQuote | null {
  return previewStashed
}

export function clearSendWalletQuote(): void {
  stashed = null
  stashedMeta = null
  previewStashed = null
  previewStashedMeta = null
}

function entryAmountsMatch(a: number, b: number): boolean {
  return Math.round(a * 100) / 100 === Math.round(b * 100) / 100
}

function metaMatches(a: SendWalletQuoteStashMeta, b: SendWalletQuoteStashMeta): boolean {
  if (a.recipientId.trim() !== b.recipientId.trim()) return false
  if (a.amountEntryMode !== b.amountEntryMode) return false
  if (a.receiveCurrency.trim().toUpperCase() !== b.receiveCurrency.trim().toUpperCase()) {
    return false
  }
  return entryAmountsMatch(a.entryAmount, b.entryAmount)
}

export function isStashedWalletQuoteFresh(input: SendWalletQuoteStashMeta): boolean {
  if (!stashed?.expiresAt || !stashed.formSessionId || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashed.quotePhase === 'preview') return false
  return metaMatches(stashedMeta, input)
}

/** Fresh un-confirmed preview from the typing prefetch – lets Continue navigate-then-resolve. */
export function isStashedWalletQuotePreviewFresh(input: SendWalletQuoteStashMeta): boolean {
  if (!previewStashed?.expiresAt || !previewStashed.formSessionId || !previewStashedMeta) return false
  if (new Date(previewStashed.expiresAt).getTime() <= Date.now()) return false
  return metaMatches(previewStashedMeta, input)
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
  if (isStashedWalletQuotePreviewFresh(meta)) return peekSendWalletQuotePreview()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastWalletQuoteError = null
  inflightQuote = fetchQuote()
    .then((quote) => {
      lastWalletQuoteError = null
      const preview = { ...quote, quotePhase: 'preview' as const }
      stashSendWalletQuotePreview(preview, meta)
      return preview
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
    // Skip the quote POST when the typing prefetch already stashed a fresh preview.
    const preview = isStashedWalletQuotePreviewFresh(meta)
      ? peekSendWalletQuotePreview()
      : await ensureSendWalletQuoteStashed(fetchQuote, meta)
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
  bridgeMid?: number
  executionModel?: 'direct_turnkey' | 'relay_bridge'
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
    bridgeMid: quote.bridgeMid,
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
    // `exchangeFee` feeds the combined Processing fee row – use the footing display channel.
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
