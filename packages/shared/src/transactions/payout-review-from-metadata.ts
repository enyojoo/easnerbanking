/** Nested payout review on ledger metadata (`payout_review`, with `review_snapshot` alias). */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

const NOAH_PAYOUT_ALIAS_KEYS = [
  "noah_send_amount",
  "noah_floor",
  "noah_schedule_fee",
  "noah_channel_fee",
  "quote_noah_mid",
] as const

export function isYcBalancePayoutMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  if (String(meta.yc_mode ?? "").toLowerCase() === "balance_payout") return true
  if (String(meta.source ?? "") === "api_yellowcard_balance_payout") return true
  return (
    String(meta.payout_provider ?? "").toLowerCase() === "yellowcard" &&
    String(meta.payout_type ?? "").toLowerCase() === "global_fiat"
  )
}

export function isGridBalancePayoutMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  if (String(meta.payout_provider ?? "").toLowerCase() === "grid") return true
  if (String(meta.grid_mode ?? "").toLowerCase() === "balance_payout") return true
  const quoteId = String(meta.grid_quote_id ?? "").trim()
  return quoteId.startsWith("Quote:") || quoteId.length > 0
}

/** Crypto authorized to the payout rail (YC / Noah / Grid). */
export function payoutCryptoAuthorizedAmountFromMeta(
  meta: Record<string, unknown> | null | undefined,
): number | null {
  if (!meta) return null
  return (
    positiveNumber(meta.crypto_authorized_amount) ??
    positiveNumber(meta.yc_send_amount) ??
    positiveNumber(meta.noah_send_amount) ??
    positiveNumber(meta.yc_floor) ??
    positiveNumber(meta.noah_floor)
  )
}

/** Persist rail send on `payout_review` without Noah aliases on Yellowcard tickets. */
export function payoutReviewRailOpsFields(input: {
  payoutProvider?: string | null
  cryptoSendAmount?: number | null
  scheduleFee?: number | null
  prepareChannelFee?: number | null
  quoteNoahMid?: number | null
}): Record<string, number> {
  const provider = String(input.payoutProvider ?? "").trim().toLowerCase()
  const crypto = positiveNumber(input.cryptoSendAmount)
  if (provider === "yellowcard") {
    return crypto != null ? { yc_send_amount: crypto, yc_floor: crypto } : {}
  }
  const next: Record<string, number> = {}
  if (crypto != null) {
    next.noah_send_amount = crypto
    next.noah_floor = crypto
  }
  const scheduleFee = positiveNumber(input.scheduleFee)
  if (scheduleFee != null) next.noah_schedule_fee = scheduleFee
  const channelFee = positiveNumber(input.prepareChannelFee)
  if (channelFee != null) next.noah_channel_fee = channelFee
  const quoteMid = positiveNumber(input.quoteNoahMid)
  if (quoteMid != null) next.quote_noah_mid = quoteMid
  return next
}

function stripNoahPayoutAliases(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record }
  for (const key of NOAH_PAYOUT_ALIAS_KEYS) {
    delete next[key]
  }
  return next
}

function relabelYcPayoutReviewSnapshot(
  nested: Record<string, unknown>,
  crypto: number | null,
): Record<string, unknown> {
  const next = stripNoahPayoutAliases(nested)
  const send =
    positiveNumber(next.yc_send_amount) ?? crypto ?? positiveNumber(nested.noah_send_amount)
  if (send != null) {
    next.yc_send_amount = send
    next.yc_floor = positiveNumber(next.yc_floor) ?? send
  }
  return next
}

/**
 * Presentation copy of YC payout metadata: `yc_send_amount` instead of Noah aliases.
 * Does not mutate the stored ledger row.
 */
export function relabelYcPayoutMetadataForPresentation(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  if (!isYcBalancePayoutMetadata(meta)) return meta
  const crypto = payoutCryptoAuthorizedAmountFromMeta(meta)
  let next = stripNoahPayoutAliases(meta)
  if (crypto != null) {
    if (next.yc_send_amount == null) next.yc_send_amount = crypto
    if (next.yc_floor == null) next.yc_floor = crypto
  }
  if (next.noah_refund_expected === true) {
    next.yc_refund_expected = true
    delete next.noah_refund_expected
  }
  if (next.noah_refund_amount != null && next.yc_refund_amount == null) {
    next.yc_refund_amount = next.noah_refund_amount
  }
  delete next.noah_refund_amount
  if (next.noah_refund_tx_hash != null && next.yc_refund_tx_hash == null) {
    next.yc_refund_tx_hash = next.noah_refund_tx_hash
  }
  delete next.noah_refund_tx_hash

  const review = asRecord(next.payout_review)
  if (review) next = { ...next, payout_review: relabelYcPayoutReviewSnapshot(review, crypto) }
  const snapshot = asRecord(next.review_snapshot)
  if (snapshot) next = { ...next, review_snapshot: relabelYcPayoutReviewSnapshot(snapshot, crypto) }
  return next
}

/**
 * Grid execute stores live send/total on the metadata root. Nested `payout_review`
 * can still hold the Office estimate – overlay executed amounts so details match
 * what Grid actually sent.
 */
export function overlayGridExecutedPayoutReview(
  meta: Record<string, unknown>,
  nested: Record<string, unknown>,
): Record<string, unknown> {
  if (!isGridBalancePayoutMetadata(meta)) return nested
  const crypto = positiveNumber(meta.crypto_authorized_amount ?? meta.noah_send_amount)
  const totalDebited = positiveNumber(meta.total_debited)
  if (crypto == null && totalDebited == null) return nested

  const processingFee = positiveNumber(meta.processing_fee)
  const marginAmount = positiveNumber(meta.margin_amount)
  const channelCost = positiveNumber(meta.channel_cost)
  const customerRate = positiveNumber(meta.customer_rate)
  const youSend = crypto ?? positiveNumber(nested.you_send_amount)
  const total = totalDebited ?? positiveNumber(nested.total_debited)

  const next: Record<string, unknown> = { ...nested }
  if (youSend != null) {
    next.you_send_amount = youSend
    next.noah_send_amount = youSend
    next.noah_floor = youSend
  }
  if (total != null) next.total_debited = total
  if (processingFee != null) {
    next.processing_fee = processingFee
    next.easner_fee = processingFee
  }
  if (marginAmount != null) next.margin_amount = marginAmount
  if (channelCost != null) next.channel_cost = channelCost
  if (customerRate != null) next.exchange_rate = customerRate

  if (youSend != null && total != null) {
    const remainder = Math.round((total - youSend - (processingFee ?? 0)) * 1_000_000) / 1_000_000
    next.exchange_fee = remainder >= 0 ? remainder : 0
  }
  return next
}

export function rawPayoutReviewFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): unknown {
  if (!meta || typeof meta !== "object") return null
  const nested = asRecord(meta.payout_review) ?? asRecord(meta.review_snapshot)
  if (!nested) return null
  const afterGrid = overlayGridExecutedPayoutReview(meta, nested)
  if (!isYcBalancePayoutMetadata(meta)) return afterGrid
  return relabelYcPayoutReviewSnapshot(afterGrid, payoutCryptoAuthorizedAmountFromMeta(meta))
}
