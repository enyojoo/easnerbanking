import type { PayoutQuote } from './noahService'
import type { PayoutPrepareSession } from './payoutPrepareSession'

/** Inline — avoid `@easner/shared` barrel (pulls flag assets into Metro on EAS). */
function normalizeReceiveForCurrency(currency: string, amount: number): number {
  const cur = currency.trim().toUpperCase()
  const normalized = Math.round(amount * 100) / 100
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  const zeroDecimal = new Set(['NGN', 'KES', 'GHS', 'UGX', 'RWF', 'XOF', 'XAF'])
  if (zeroDecimal.has(cur)) return Math.round(normalized)
  return normalized
}

function entryAmountsMatch(a: number, b: number, currency: string): boolean {
  return normalizeReceiveForCurrency(currency, a) === normalizeReceiveForCurrency(currency, b)
}

function sendEntryAmountsMatch(a: number, b: number): boolean {
  const norm = (n: number) => Math.round(n * 100) / 100
  return norm(a) === norm(b)
}

function resolveSettlementLeg(quote: PayoutQuote) {
  if (quote.settlement?.sessionId && quote.settlement.cryptoAuthorizedAmount) {
    return quote.settlement
  }
  const n = quote.noah
  if (!n?.formSessionId || !n.cryptoAuthorizedAmount) return null
  return {
    totalFee: n.totalFee,
    feeCurrency: 'USD',
    cryptoAuthorizedAmount: n.cryptoAuthorizedAmount,
    cryptoFloor: n.noahFloor,
    cryptoSendAmount: n.noahSendAmount,
    cryptoCurrency: n.cryptoCurrency,
    sessionId: n.formSessionId,
    customerRate: n.rate ?? quote.easner?.providerRate,
    providerMid: n.noahMid,
    effectiveRate: n.rate,
    marginCaptureMode: (n.marginCaptureMode ?? 'surplus_send') as 'surplus_send' | 'split_debit',
    channelCost: n.channelCost ?? quote.channelCost,
    marginAmount: n.marginAmount ?? quote.marginAmount,
    customerPrincipal: n.customerPrincipal ?? quote.customerPrincipal,
  }
}

function reviewFeesFromQuote(quote: PayoutQuote) {
  const channelFee =
    quote.displayChannelCost != null && Number.isFinite(quote.displayChannelCost)
      ? quote.displayChannelCost
      : quote.channelCost
  const easnerProcessingFee = quote.processingFee ?? 0
  const displayProcessingFee =
    quote.displayProcessingFee ??
    Math.round((easnerProcessingFee + channelFee) * 1_000_000) / 1_000_000
  return { easnerProcessingFee, channelFee, displayProcessingFee }
}

export type SendPayoutQuoteStashMeta = {
  recipientId: string
  amountEntryMode: 'send' | 'receive'
  /** Send-side principal when mode=send; receive fiat when mode=receive. */
  entryAmount: number
  receiveCurrency: string
}

let stashed: PayoutQuote | null = null
let stashedMeta: SendPayoutQuoteStashMeta | null = null
let previewStashed: PayoutQuote | null = null
let previewStashedMeta: SendPayoutQuoteStashMeta | null = null
let lastPayoutQuoteError: string | null = null

export function isUsablePayoutQuotePreview(quote: PayoutQuote | null | undefined): quote is PayoutQuote {
  const leg = quote ? resolveSettlementLeg(quote) : null
  const easnerRate = quote?.easner?.providerRate
  return Boolean(
    quote?.expiresAt &&
      leg?.sessionId &&
      leg.cryptoAuthorizedAmount &&
      leg.cryptoCurrency &&
      quote.easner &&
      Number.isFinite(easnerRate) &&
      easnerRate > 0,
  )
}

/** Locked order from `/confirm` — required before authorize (Noah). YC uses preview until PIN execute. */
export function isCompletePayoutQuote(quote: PayoutQuote | null | undefined): quote is PayoutQuote {
  if (!isUsablePayoutQuotePreview(quote)) return false
  if (new Date(quote.expiresAt).getTime() <= Date.now()) return false
  if (
    quote.provider === 'yellowcard' &&
    quote.quotePhase === 'preview' &&
    quote.requiresConfirm !== false
  ) {
    return Boolean(quote.settlement?.sessionId || quote.yc?.sequenceId)
  }
  if (quote.quotePhase === 'locked') {
    return Boolean(quote.lockId || quote.yc?.sendId || quote.settlement?.sessionId)
  }
  if (quote.quotePhase === 'preview') return false
  return Boolean(quote.settlement?.sessionId || quote.noah?.formSessionId)
}

export function isYellowcardPayoutQuote(quote: PayoutQuote | null | undefined): boolean {
  return String(quote?.provider ?? '').toLowerCase() === 'yellowcard'
}

/** Review / PIN CTA — YC preview is valid before POST /send lock; Noah needs confirm lock. */
export function isPayoutSessionReadyForExecute(
  session: PayoutPrepareSession | undefined,
  recipientId: string | undefined,
): boolean {
  if (
    !session?.formSessionId?.trim() ||
    !session?.cryptoAuthorizedAmount?.trim() ||
    !session?.cryptoCurrency?.trim() ||
    !recipientId ||
    session.recipientId.trim() !== recipientId.trim()
  ) {
    return false
  }
  if (session.lockId || session.ycSendId) return true
  // YC lock-on-review: preview sequenceId alone is not enough — need confirm lock.
  if (session.payoutProvider === 'yellowcard') return false
  return Boolean(session.formSessionId.trim())
}

export function stashSendPayoutQuote(quote: PayoutQuote, meta: SendPayoutQuoteStashMeta): void {
  if (!isCompletePayoutQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  lastPayoutQuoteError = null
}

export function stashSendPayoutQuotePreview(quote: PayoutQuote, meta: SendPayoutQuoteStashMeta): void {
  if (!isUsablePayoutQuotePreview(quote)) return
  previewStashed = quote
  previewStashedMeta = meta
}

export function peekSendPayoutQuotePreview(): PayoutQuote | null {
  return previewStashed
}

export function isStashedPayoutQuotePreviewFresh(input: SendPayoutQuoteStashMeta): boolean {
  if (!isUsablePayoutQuotePreview(previewStashed) || !previewStashedMeta) return false
  if (new Date(previewStashed.expiresAt).getTime() <= Date.now()) return false
  if (previewStashedMeta.recipientId.trim() !== input.recipientId.trim()) return false
  if (previewStashedMeta.amountEntryMode !== input.amountEntryMode) return false
  if (
    previewStashedMeta.receiveCurrency.trim().toUpperCase() !==
    input.receiveCurrency.trim().toUpperCase()
  ) {
    return false
  }
  if (input.amountEntryMode === 'send') {
    return sendEntryAmountsMatch(previewStashedMeta.entryAmount, input.entryAmount)
  }
  return entryAmountsMatch(previewStashed.receiveAmount, input.entryAmount, input.receiveCurrency)
}

export function peekSendPayoutQuote(): PayoutQuote | null {
  return stashed
}

export function peekLastPayoutQuoteError(): string | null {
  return lastPayoutQuoteError
}

export function clearSendPayoutQuote(): void {
  stashed = null
  stashedMeta = null
  previewStashed = null
  previewStashedMeta = null
  lastPayoutQuoteError = null
}

export function isStashedPayoutQuoteFresh(input: SendPayoutQuoteStashMeta): boolean {
  if (!isCompletePayoutQuote(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  if (stashedMeta.recipientId.trim() !== input.recipientId.trim()) return false
  if (stashedMeta.amountEntryMode !== input.amountEntryMode) return false
  if (stashedMeta.receiveCurrency.trim().toUpperCase() !== input.receiveCurrency.trim().toUpperCase()) {
    return false
  }
  if (input.amountEntryMode === 'send') {
    return sendEntryAmountsMatch(stashedMeta.entryAmount, input.entryAmount)
  }
  return entryAmountsMatch(stashed.receiveAmount, input.entryAmount, input.receiveCurrency)
}

let inflightQuote: Promise<PayoutQuote | null> | null = null
let inflightQuoteKey = ''
let inflightConfirm: Promise<PayoutQuote | null> | null = null
let inflightConfirmKey = ''

function quoteMetaKey(meta: SendPayoutQuoteStashMeta): string {
  return [
    meta.recipientId,
    meta.amountEntryMode,
    meta.entryAmount,
    meta.receiveCurrency,
  ].join('|')
}

/** Deduped quote fetch — used for background prefetch and Continue gate. */
export async function ensureSendPayoutQuoteStashed(
  fetchQuote: () => Promise<PayoutQuote>,
  meta: SendPayoutQuoteStashMeta,
): Promise<PayoutQuote | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekSendPayoutQuote()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastPayoutQuoteError = null
  inflightQuote = fetchQuote()
    .then((quote) => {
      if (!isUsablePayoutQuotePreview(quote)) {
        lastPayoutQuoteError = 'Incomplete payout quote response.'
        return null
      }
      stashSendPayoutQuotePreview(quote, meta)
      return quote
    })
    .catch((err) => {
      lastPayoutQuoteError = err instanceof Error ? err.message : 'quote_failed'
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ''
    })

  return inflightQuote
}

/** Lock payout order at review — idempotent by quote key on server. */
export async function ensureSendPayoutOrderConfirmed(
  fetchConfirm: () => Promise<PayoutQuote>,
  meta: SendPayoutQuoteStashMeta,
): Promise<PayoutQuote | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekSendPayoutQuote()

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastPayoutQuoteError = null
  inflightConfirm = fetchConfirm()
    .then((quote) => {
      if (!isCompletePayoutQuote(quote)) {
        lastPayoutQuoteError = 'Incomplete locked payout quote.'
        return null
      }
      stashSendPayoutQuote(quote, meta)
      return quote
    })
    .catch((err) => {
      lastPayoutQuoteError = err instanceof Error ? err.message : 'confirm_failed'
      return null
    })
    .finally(() => {
      inflightConfirm = null
      inflightConfirmKey = ''
    })

  return inflightConfirm
}

export function payoutPrepareSessionFromQuote(
  quote: PayoutQuote,
  recipientId: string,
): PayoutPrepareSession | undefined {
  const leg = resolveSettlementLeg(quote)
  if (!leg) return undefined
  return {
    recipientId,
    formSessionId: leg.sessionId,
    cryptoAuthorizedAmount: leg.cryptoAuthorizedAmount,
    cryptoCurrency: leg.cryptoCurrency,
    ...(quote.channelId ? { channelId: quote.channelId } : {}),
    noahFloor: leg.cryptoFloor,
    noahSendAmount: leg.cryptoSendAmount,
    totalDebited: String(quote.totalDebited),
    marginAmount: String(quote.marginAmount),
    ...(leg.marginCaptureMode ? { marginCaptureMode: leg.marginCaptureMode } : {}),
    ...(leg.customerRate != null ? { customerRate: leg.customerRate } : {}),
    ...(leg.providerMid != null ? { noahMid: leg.providerMid } : {}),
    ...(quote.provider ? { payoutProvider: quote.provider } : {}),
    ...(quote.yc?.sequenceId ? { ycSequenceId: quote.yc.sequenceId } : {}),
    ...(quote.yc?.walletAddress ? { ycWalletAddress: quote.yc.walletAddress } : {}),
    ...(quote.yc?.cryptoAmount != null ? { ycCryptoAmount: quote.yc.cryptoAmount } : {}),
    ...(quote.yc?.sendId ? { ycSendId: quote.yc.sendId } : {}),
    ...(quote.lockId ? { lockId: quote.lockId } : {}),
  }
}

export function payoutDisplayAmountsFromQuote(quote: PayoutQuote): {
  youSendAmount: number
  exchangeFee: number
  marginAmount: number
  processingFee: number
  displayChannelCost: number
  displayProcessingFee: number
  totalDebited: number
  customerRate: number
} {
  const fees = reviewFeesFromQuote(quote)
  const leg = resolveSettlementLeg(quote)
  return {
    youSendAmount: quote.customerPrincipal,
    exchangeFee: fees.channelFee,
    marginAmount: fees.easnerProcessingFee,
    processingFee: fees.easnerProcessingFee,
    displayChannelCost: fees.channelFee,
    displayProcessingFee: fees.displayProcessingFee,
    totalDebited: quote.totalDebited,
    customerRate: leg?.customerRate ?? quote.easner?.providerRate ?? 0,
  }
}
