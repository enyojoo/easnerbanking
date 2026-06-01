import {
  buildGlobalPayoutLifecycle,
  buildTransactionTimingRows,
  resolveTransactionTimingAnchors,
  computeBalancePayoutExchangeFee,
  formatDisplayPersonName,
  formatTransactionDetailHeroTitle,
  getGlobalPayoutTransferMethod,
  getGlobalPayoutProcessingTime,
  isGlobalPayoutOffRampOutRow,
  type GlobalPayoutLifecycleStep,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
import { extractNoahGlobalPayoutPayOutEnrichment } from "@/lib/noah/global-payout-ledger"
import { normalizePayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import type { GlobalPayoutWebhookTimestamps } from "@/lib/noah/global-payout-webhook-timestamps"

function roundFiat(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount)) return null
  return Math.round(amount * 100) / 100
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function readRecipientSnapshot(
  meta: Record<string, unknown>,
): GlobalPayoutRecipientSnapshot | null {
  const raw = meta.recipient_snapshot
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const fullName = formatDisplayPersonName(String(o.full_name || "")) || String(o.full_name || "").trim()
  if (!fullName) return null
  return {
    full_name: fullName,
    ...(o.bank_name != null && String(o.bank_name).trim()
      ? { bank_name: String(o.bank_name).trim() }
      : {}),
    ...(o.account_number != null && String(o.account_number).trim()
      ? { account_number: String(o.account_number).trim() }
      : {}),
    ...(o.phone != null && String(o.phone).trim() ? { phone: String(o.phone).trim() } : {}),
    ...(o.mobile_provider != null && String(o.mobile_provider).trim()
      ? { mobile_provider: String(o.mobile_provider).trim() }
      : {}),
    ...(o.country_code != null && String(o.country_code).trim()
      ? { country_code: String(o.country_code).trim().toUpperCase() }
      : {}),
    ...(o.currency != null && String(o.currency).trim()
      ? { currency: String(o.currency).trim().toUpperCase() }
      : {}),
  }
}

function deriveRecipientName(
  meta: Record<string, unknown>,
  recipientSnapshot: GlobalPayoutRecipientSnapshot | null,
  payload?: Record<string, unknown> | null,
): string | null {
  if (recipientSnapshot?.full_name) return recipientSnapshot.full_name
  const candidates = [
    meta.beneficiary_name,
    meta.recipient_name,
    meta.counterparty_name,
  ]
  for (const c of candidates) {
    const text = typeof c === "string" ? formatDisplayPersonName(c) : ""
    if (text) return text
  }
  if (payload) {
    const enrichment = extractNoahGlobalPayoutPayOutEnrichment(payload)
    if (enrichment?.beneficiaryName) {
      return formatDisplayPersonName(enrichment.beneficiaryName) || enrichment.beneficiaryName
    }
  }
  return null
}

function needsPayoutReviewReconstruction(review: GlobalPayoutReviewSnapshot): boolean {
  const hasFx =
    review.send_currency.toUpperCase() !== review.receive_currency.toUpperCase()
  if (!hasFx) return false
  if (review.exchange_fee > 0.001) return false
  if (review.exchange_rate > 1.001) return false
  if (review.you_send_amount < review.total_debited - 0.01) return false
  return true
}

function derivePayoutReview(
  meta: Record<string, unknown>,
  payload: Record<string, unknown> | null | undefined,
  ledgerAmount: number,
  ledgerCurrency: string,
): GlobalPayoutReviewSnapshot | null {
  const fromMeta = normalizePayoutReviewSnapshot(meta.payout_review)
  if (fromMeta && !needsPayoutReviewReconstruction(fromMeta)) return fromMeta

  const receiveAmount = roundFiat(
    typeof meta.receive_amount === "number" ? meta.receive_amount : Number(meta.receive_amount),
  )
  const receiveCurrency = String(meta.receive_currency || meta.fiat_currency || "").toUpperCase()
  if (receiveAmount == null || receiveAmount <= 0 || !receiveCurrency) {
    if (payload) {
      const enrichment = extractNoahGlobalPayoutPayOutEnrichment(payload)
      if (enrichment && enrichment.receiveAmount > 0) {
        const transferMethod = getGlobalPayoutTransferMethod({
          currency: enrichment.receiveCurrency,
          countryCode: enrichment.countryCode,
          bankName: enrichment.bankName,
        })
        const totalDebited = ledgerAmount
        const sendCurrency = ledgerCurrency
        const hasFx = sendCurrency !== enrichment.receiveCurrency
        const exchangeRate = hasFx && totalDebited > 0
          ? Math.round((enrichment.receiveAmount / totalDebited) * 100) / 100
          : 1
        const youSendAmount = hasFx && exchangeRate > 0
          ? roundFiat(enrichment.receiveAmount / exchangeRate) ?? totalDebited
          : totalDebited
        const processingFee = 0
        return {
          you_send_amount: youSendAmount,
          total_debited: totalDebited,
          exchange_fee: computeBalancePayoutExchangeFee(
            totalDebited,
            youSendAmount,
            processingFee,
          ),
          processing_fee: processingFee,
          exchange_rate: exchangeRate,
          send_currency: sendCurrency,
          receive_amount: enrichment.receiveAmount,
          receive_currency: enrichment.receiveCurrency,
          transfer_method: transferMethod,
          processing_time: getGlobalPayoutProcessingTime(transferMethod),
        }
      }
    }
    return fromMeta
  }

  const sendCurrency = String(
    fromMeta?.send_currency || meta.send_currency || ledgerCurrency,
  ).toUpperCase()
  const totalDebited =
    roundFiat(fromMeta?.total_debited) ??
    roundFiat(typeof meta.total_debited === "number" ? meta.total_debited : Number(meta.total_debited)) ??
    roundFiat(
      typeof meta.crypto_authorized_amount === "number"
        ? meta.crypto_authorized_amount
        : Number(meta.crypto_authorized_amount),
    ) ??
    ledgerAmount

  const processingFee =
    roundFiat(fromMeta?.processing_fee) ??
    roundFiat(
      typeof meta.processing_fee === "number"
        ? meta.processing_fee
        : Number(meta.processing_fee ?? meta.easner_fee ?? 0),
    ) ??
    0

  const hasFx = sendCurrency !== receiveCurrency

  let exchangeRate =
    fromMeta?.exchange_rate && fromMeta.exchange_rate > 1
      ? fromMeta.exchange_rate
      : roundFiat(Number(meta.exchange_rate)) ?? 0

  let youSendAmount =
    roundFiat(fromMeta?.you_send_amount) ??
    roundFiat(typeof meta.you_send_amount === "number" ? meta.you_send_amount : Number(meta.you_send_amount))

  if (hasFx) {
    if (!exchangeRate || exchangeRate <= 1) {
      if (youSendAmount && youSendAmount > 0 && youSendAmount < totalDebited) {
        exchangeRate = Math.round((receiveAmount / youSendAmount) * 100) / 100
      } else if (totalDebited > processingFee) {
        const approxYouSend = totalDebited - processingFee
        exchangeRate = Math.round((receiveAmount / approxYouSend) * 100) / 100
        youSendAmount = roundFiat(receiveAmount / exchangeRate)
      }
    } else if (!youSendAmount || youSendAmount >= totalDebited) {
      youSendAmount = roundFiat(receiveAmount / exchangeRate)
    }
  } else {
    exchangeRate = 1
    if (!youSendAmount || youSendAmount <= 0) {
      youSendAmount = roundFiat(totalDebited - processingFee) ?? totalDebited
    }
  }

  youSendAmount = youSendAmount ?? totalDebited
  const exchangeFee =
    fromMeta?.exchange_fee && fromMeta.exchange_fee > 0
      ? fromMeta.exchange_fee
      : computeBalancePayoutExchangeFee(totalDebited, youSendAmount, processingFee)

  const transferMethod =
    fromMeta?.transfer_method ||
    getGlobalPayoutTransferMethod({
      currency: receiveCurrency,
      countryCode: meta.country_code,
      bankName: meta.bank_name,
      mobileProvider: meta.mobile_provider,
    })

  return {
    you_send_amount: youSendAmount,
    total_debited: totalDebited,
    exchange_fee: fromMeta?.exchange_fee && fromMeta.exchange_fee > 0
      ? fromMeta.exchange_fee
      : computeBalancePayoutExchangeFee(totalDebited, youSendAmount, processingFee),
    processing_fee: processingFee,
    exchange_rate: hasFx ? exchangeRate || 1 : 1,
    send_currency: sendCurrency,
    receive_amount: receiveAmount,
    receive_currency: receiveCurrency,
    transfer_method: transferMethod,
    processing_time:
      fromMeta?.processing_time || getGlobalPayoutProcessingTime(transferMethod),
    ...(fromMeta?.margin_amount != null ? { margin_amount: fromMeta.margin_amount } : {}),
    ...(fromMeta?.easner_fee != null ? { easner_fee: fromMeta.easner_fee } : {}),
    ...(fromMeta?.noah_floor != null ? { noah_floor: fromMeta.noah_floor } : {}),
    ...(fromMeta?.noah_send_amount != null ? { noah_send_amount: fromMeta.noah_send_amount } : {}),
    ...(fromMeta?.channel_cost != null ? { channel_cost: fromMeta.channel_cost } : {}),
  }
}

export type ResolvedGlobalPayoutOffRamp = {
  effectiveMetadata: Record<string, unknown>
  lifecycle: GlobalPayoutLifecycleStep[]
  displayAmount: number
  displayCurrency: string
  ledgerAmount: number
  ledgerCurrency: string
  displayDescription: string
  displayHeroTitle: string
  payoutReview: GlobalPayoutReviewSnapshot | null
  recipientSnapshot: GlobalPayoutRecipientSnapshot | null
  sendNote: string | null
  processingAt: string | null
  completedAt: string | null
  failedAt: string | null
  transactionStartedAt: string | null
  ledgerCreatedAt: string | null
  transactionTiming: TransactionTimingRow[]
  easnerPayoutId: string | null
}

export function resolveGlobalPayoutOffRampDetail(
  row: Record<string, unknown>,
  webhook?: GlobalPayoutWebhookTimestamps | null,
): ResolvedGlobalPayoutOffRamp | null {
  if (!isGlobalPayoutOffRampOutRow(row)) return null

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const payload = (row.payload as Record<string, unknown> | null | undefined) ?? {}
  const ledgerAmount =
    roundFiat(typeof row.amount === "number" ? row.amount : Number(row.amount)) ?? 0
  const ledgerCurrency = String(row.currency ?? row.base_currency ?? "USD").toUpperCase()

  const recipientSnapshot = readRecipientSnapshot(meta)
  const recipientName = deriveRecipientName(meta, recipientSnapshot, payload)
  const payoutReview = derivePayoutReview(meta, payload, ledgerAmount, ledgerCurrency)

  const displayAmount = payoutReview?.receive_amount ?? roundFiat(meta.receive_amount as number) ?? ledgerAmount
  const displayCurrency =
    payoutReview?.receive_currency ??
    String(meta.receive_currency || meta.fiat_currency || ledgerCurrency).toUpperCase()

  const ledgerTotal =
    payoutReview?.total_debited ??
    roundFiat(typeof meta.total_debited === "number" ? meta.total_debited : ledgerAmount) ??
    ledgerAmount
  const ledgerCur =
    payoutReview?.send_currency ??
    String(meta.send_currency || ledgerCurrency).toUpperCase()

  const displayDescription = recipientName || "Transfer"
  const displayHeroTitle = formatTransactionDetailHeroTitle({
    direction: "out",
    counterpartyName: recipientName,
    productFallback: "Transfer",
  })

  const processingAt =
    pickIso(meta.processing_at) ?? webhook?.processingAt ?? pickIso(row.occurred_at, row.created_at)
  const completedAt = pickIso(meta.completed_at, webhook?.completedAt)
  const failedAt = pickIso(
    meta.failed_at,
    meta.noah_payout_failed_at,
    webhook?.failedAt,
  )

  const effectiveMetadata: Record<string, unknown> = {
    ...meta,
    ...(processingAt ? { processing_at: processingAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(recipientName
      ? {
          beneficiary_name: recipientName,
          recipient_name: recipientName,
          counterparty_name: recipientName,
        }
      : {}),
  }

  const lifecycle = buildGlobalPayoutLifecycle({
    status: String(row.status ?? ""),
    metadata: effectiveMetadata,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    settledAt: row.settled_at != null ? String(row.settled_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    payoutReview,
    recipientName,
  })

  const sendNote =
    typeof meta.send_note === "string"
      ? meta.send_note.trim()
      : typeof meta.note === "string"
        ? meta.note.trim()
        : null

  const easnerPayoutId =
    meta.easner_payout_id != null ? String(meta.easner_payout_id).trim() : null

  const timingAnchors = resolveTransactionTimingAnchors({
    createdAt: row.created_at != null ? String(row.created_at) : null,
    metadata: effectiveMetadata,
    webhookCompletedAt: webhook?.completedAt,
    webhookFailedAt: webhook?.failedAt,
    lifecycle,
  })

  const transactionTiming = buildTransactionTimingRows({
    status: String(row.status ?? ""),
    startedAt: timingAnchors.startedAt,
    completedAt: timingAnchors.completedAt,
    failedAt: timingAnchors.failedAt,
    expectedProcessingTime: payoutReview?.processing_time,
    showExpectedWhileInFlight: true,
    showStartedWhileInFlight: true,
  })

  const transactionStartedAt = timingAnchors.startedAt

  return {
    effectiveMetadata,
    lifecycle,
    displayAmount,
    displayCurrency,
    ledgerAmount: ledgerTotal,
    ledgerCurrency: ledgerCur,
    displayDescription,
    displayHeroTitle,
    payoutReview,
    recipientSnapshot,
    sendNote: sendNote || null,
    processingAt,
    completedAt,
    failedAt,
    transactionStartedAt,
    ledgerCreatedAt: row.created_at != null ? String(row.created_at) : null,
    transactionTiming,
    easnerPayoutId,
  }
}
