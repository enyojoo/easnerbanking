import {
  buildGlobalPayoutLifecycle,
  formatDisplayPersonName,
  formatTransactionDetailHeroTitle,
  getGlobalPayoutTransferMethod,
  getGlobalPayoutProcessingTime,
  isGlobalPayoutOffRampOutRow,
  type GlobalPayoutLifecycleStep,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
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

function derivePayoutReview(
  meta: Record<string, unknown>,
  payload: Record<string, unknown> | null | undefined,
  ledgerAmount: number,
  ledgerCurrency: string,
): GlobalPayoutReviewSnapshot | null {
  const fromMeta = normalizePayoutReviewSnapshot(meta.payout_review)
  if (fromMeta) return fromMeta

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
        return {
          you_send_amount: ledgerAmount,
          total_debited: ledgerAmount,
          exchange_fee: 0,
          processing_fee: 0,
          exchange_rate: 1,
          send_currency: ledgerCurrency,
          receive_amount: enrichment.receiveAmount,
          receive_currency: enrichment.receiveCurrency,
          transfer_method: transferMethod,
          processing_time: getGlobalPayoutProcessingTime(transferMethod),
        }
      }
    }
    return null
  }

  const totalDebited =
    roundFiat(typeof meta.total_debited === "number" ? meta.total_debited : ledgerAmount) ??
    ledgerAmount

  const transferMethod = getGlobalPayoutTransferMethod({
    currency: receiveCurrency,
    countryCode: meta.country_code,
    bankName: meta.bank_name,
    mobileProvider: meta.mobile_provider,
  })

  return {
    you_send_amount: totalDebited,
    total_debited: totalDebited,
    exchange_fee: 0,
    processing_fee: 0,
    exchange_rate: 1,
    send_currency: ledgerCurrency,
    receive_amount: receiveAmount,
    receive_currency: receiveCurrency,
    transfer_method: transferMethod,
    processing_time: getGlobalPayoutProcessingTime(transferMethod),
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
  const completedAt =
    pickIso(meta.completed_at) ?? webhook?.completedAt ?? pickIso(row.settled_at)

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
    easnerPayoutId,
  }
}
