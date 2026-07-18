import {
  buildGlobalPayoutLifecycle,
  buildTransactionTimingRows,
  resolveTransactionTimingAnchors,
  computeBalancePayoutExchangeFee,
  formatDisplayPersonName,
  formatOutboundTransferTitle,
  getGlobalPayoutTransferMethod,
  getGlobalPayoutProcessingTime,
  isGlobalPayoutOffRampOutRow,
  TLC_LOCAL_TRANSFER_METHOD,
  type GlobalPayoutLifecycleStep,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
import { extractNoahGlobalPayoutPayOutEnrichment } from "@/lib/noah/global-payout-ledger"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"
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

function mergePayoutReviewDisplayProcessingFeeLocal(
  review: GlobalPayoutReviewSnapshot,
  meta: Record<string, unknown>,
): GlobalPayoutReviewSnapshot {
  let merged = review
  const onReview = roundFiat(review.display_processing_fee_local)
  if (!(onReview != null && onReview > 0)) {
    const fromMeta = roundFiat(Number(meta.display_processing_fee_local))
    if (fromMeta != null && fromMeta > 0) {
      merged = { ...merged, display_processing_fee_local: fromMeta }
    } else {
      const raw = meta.payout_review
      if (raw && typeof raw === "object") {
        const fromRaw = roundFiat(Number((raw as Record<string, unknown>).display_processing_fee_local))
        if (fromRaw != null && fromRaw > 0) {
          merged = { ...merged, display_processing_fee_local: fromRaw }
        }
      }
    }
  }
  if (!(merged.principal_local_pay_in != null && merged.principal_local_pay_in > 0)) {
    const principalLocal =
      roundFiat(Number((meta.pay_in_review as Record<string, unknown> | undefined)?.principal_local_pay_in)) ??
      roundFiat(Number(meta.provisional_pay_in)) ??
      roundFiat(Number(meta.principal_local_pay_in))
    if (principalLocal != null && principalLocal > 0) {
      merged = { ...merged, principal_local_pay_in: principalLocal }
    }
  }
  return merged
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
  if (fromMeta && !needsPayoutReviewReconstruction(fromMeta)) {
    return mergePayoutReviewDisplayProcessingFeeLocal(fromMeta, meta)
  }

  const receiveAmount = roundFiat(
    typeof meta.receive_amount === "number" ? meta.receive_amount : Number(meta.receive_amount),
  )
  const receiveCurrency = String(meta.receive_currency || meta.fiat_currency || "").toUpperCase()

  if (
    String(meta.yc_mode ?? "") === "cross_border_send" &&
    receiveAmount != null &&
    receiveAmount > 0 &&
    receiveCurrency
  ) {
    const localPayIn =
      roundFiat(Number(meta.local_pay_in)) ??
      roundFiat(fromMeta?.you_send_amount) ??
      ledgerAmount
    if (localPayIn != null && localPayIn > 0) {
      const sendCurrency = String(
        meta.local_currency ?? meta.send_currency ?? ledgerCurrency,
      ).toUpperCase()
      const processingFee =
        roundFiat(fromMeta?.processing_fee) ??
        roundFiat(Number(meta.processing_fee)) ??
        0
      const exchangeFee =
        roundFiat(fromMeta?.exchange_fee) ??
        roundFiat(Number(meta.exchange_fee ?? meta.yc_leg_fees_usd)) ??
        0
      const exchangeRate =
        roundFiat(fromMeta?.exchange_rate) ??
        roundFiat(Number(meta.customer_rate ?? meta.customerRate)) ??
        1
      const transferMethod = TLC_LOCAL_TRANSFER_METHOD
      const displayFeeLocal = roundFiat(Number(meta.display_processing_fee_local))
      const principalLocal =
        roundFiat(Number(meta.pay_in_review?.principal_local_pay_in)) ??
        roundFiat(Number(meta.provisional_pay_in)) ??
        roundFiat(fromMeta?.principal_local_pay_in)
      return {
        you_send_amount: localPayIn,
        total_debited: localPayIn,
        exchange_fee: exchangeFee ?? 0,
        processing_fee: processingFee ?? 0,
        exchange_rate: exchangeRate ?? 1,
        send_currency: sendCurrency,
        receive_amount: receiveAmount,
        receive_currency: receiveCurrency,
        transfer_method: transferMethod,
        processing_time: getGlobalPayoutProcessingTime(transferMethod),
        ...(displayFeeLocal != null && displayFeeLocal > 0
          ? { display_processing_fee_local: displayFeeLocal }
          : {}),
        ...(principalLocal != null && principalLocal > 0
          ? { principal_local_pay_in: principalLocal }
          : {}),
      }
    }
  }

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
        const customerRate = roundFiat(Number(meta.customer_rate ?? meta.customerRate)) ?? 0
        const channelCostMeta =
          roundFiat(
            Number(meta.noah_channel_fee ?? meta.channel_cost ?? meta.exchange_fee),
          ) ?? null
        const exchangeRate =
          hasFx && customerRate > 1
            ? customerRate
            : hasFx && totalDebited > 0
              ? Math.round((enrichment.receiveAmount / totalDebited) * 100) / 100
              : 1
        const youSendAmount =
          hasFx && customerRate > 1
            ? roundFiat(enrichment.receiveAmount / customerRate) ?? totalDebited
            : hasFx && exchangeRate > 0
              ? roundFiat(enrichment.receiveAmount / exchangeRate) ?? totalDebited
              : totalDebited
        const processingFee = 0
        const exchangeFee =
          channelCostMeta != null && channelCostMeta > 0
            ? channelCostMeta
            : computeBalancePayoutExchangeFee(totalDebited, youSendAmount, processingFee)
        return {
          you_send_amount: youSendAmount,
          total_debited: totalDebited,
          exchange_fee: exchangeFee,
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
      : roundFiat(Number(meta.exchange_rate ?? meta.customer_rate ?? meta.customerRate)) ?? 0

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
  const channelFromMeta =
    roundFiat(Number(meta.noah_channel_fee ?? meta.channel_cost)) ?? null
  const exchangeFee =
    fromMeta?.exchange_fee && fromMeta.exchange_fee > 0
      ? fromMeta.exchange_fee
      : channelFromMeta != null && channelFromMeta > 0
        ? channelFromMeta
        : computeBalancePayoutExchangeFee(totalDebited, youSendAmount, processingFee)

  const transferMethod =
    fromMeta?.transfer_method ||
    getGlobalPayoutTransferMethod({
      currency: receiveCurrency,
      countryCode: meta.country_code != null ? String(meta.country_code) : null,
      bankName: meta.bank_name != null ? String(meta.bank_name) : null,
      mobileProvider:
        meta.mobile_provider != null ? String(meta.mobile_provider) : null,
    })

  return {
    you_send_amount: youSendAmount,
    total_debited: totalDebited,
    exchange_fee:
      fromMeta?.exchange_fee && fromMeta.exchange_fee > 0
        ? fromMeta.exchange_fee
        : channelFromMeta != null && channelFromMeta > 0
          ? channelFromMeta
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
    ...(() => {
      const displayFeeLocal =
        roundFiat(fromMeta?.display_processing_fee_local) ??
        roundFiat(Number(meta.display_processing_fee_local))
      return displayFeeLocal != null && displayFeeLocal > 0
        ? { display_processing_fee_local: displayFeeLocal }
        : {}
    })(),
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

  const displayHeroTitle = formatOutboundTransferTitle(recipientName)
  const displayDescription = displayHeroTitle

  const processingAt = pickIso(webhook?.processingAt, meta.processing_at)
  const completedAt = pickIso(webhook?.completedAt, meta.completed_at)
  const failedAt = pickIso(webhook?.failedAt, meta.failed_at, meta.noah_payout_failed_at)

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
    webhookProcessingAt: webhook?.processingAt,
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
    showExpectedWhileInFlight: false,
    showStartedWhileInFlight: false,
    showTerminalDuration: false,
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
    ledgerCreatedAt: resolveLedgerWhenAtFromRow(row),
    transactionTiming,
    easnerPayoutId,
  }
}
