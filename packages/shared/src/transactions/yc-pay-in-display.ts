/**
 * YC pay-in UX: distinguish quote lock, user attestation, and webhook processing.
 */

import type { YcPayInRail } from "../yc-pay-in-copy"
import type { LedgerTransactionStatusDisplay } from "./ledger-status-display"
import { ledgerTransactionStatusDisplay } from "./ledger-status-display"

export const YC_PAY_IN_CONFIRMING_STATUS = "confirming_payment"

/** List / feed status slug for in-flight YC pay-ins. */
export const YC_PAY_IN_LIST_STATUS = "processing_payment"

/** List / feed pill copy — detail lifecycle step stays Confirming payment. */
export const YC_PAY_IN_LIST_STATUS_LABEL = "Processing payment"

/** Lifecycle step title — used on detail deposit tracker only. */
export const YC_PAY_IN_CONFIRMING_STATUS_LABEL = "Confirming payment"

/** Lifecycle step title — matches detail deposit tracker. */
export const YC_PAY_IN_CONFIRMING_STEP_TITLE = "Confirming payment"

/** @deprecated Use YC_PAY_IN_CONFIRMING_STATUS */
export const YC_PAY_IN_AWAITING_STATUS = YC_PAY_IN_CONFIRMING_STATUS

/** @deprecated Use YC_PAY_IN_CONFIRMING_STATUS_LABEL */
export const YC_PAY_IN_AWAITING_STATUS_LABEL = YC_PAY_IN_CONFIRMING_STATUS_LABEL

/** @deprecated Use YC_PAY_IN_CONFIRMING_STEP_TITLE */
export const YC_PAY_IN_AWAITING_STEP_TITLE = YC_PAY_IN_CONFIRMING_STEP_TITLE

export const YC_PAY_IN_CONFIRMING_DESCRIPTION_PREFIX =
  "Complete the transfer using the payment details "
export const YC_PAY_IN_CROSS_BORDER_CONFIRMING_DESCRIPTION_PREFIX =
  "Send the exact amount using the payment details "

export const YC_PAY_IN_CONFIRMING_BANK_WAITING_DESCRIPTION =
  "We're waiting for your bank to confirm the deposit."
export const YC_PAY_IN_CROSS_BORDER_CONFIRMING_BANK_WAITING_DESCRIPTION =
  "We're waiting for your bank to confirm the transfer."

/** @deprecated Use YC_PAY_IN_CONFIRMING_DESCRIPTION_PREFIX */
export const YC_PAY_IN_AWAITING_DESCRIPTION_PREFIX = YC_PAY_IN_CONFIRMING_DESCRIPTION_PREFIX
export const YC_PAY_IN_AWAITING_DESCRIPTION_LINK = "here"
export const YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX = "."
export const YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED =
  "The time to complete this transfer has passed — contact support with your transaction ID."

/** Shown on Review & Complete when the deposit window closes — user should restart the flow. */
export const YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED =
  "The time to complete this payment has passed. Go back and start again."

/** Bare deposit countdown — live timer (mm:ss under 1h, H:MM:SS from 1h, days + timer above). */
export function formatYcPayInDepositTimeRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000))
  if (totalSec >= 86400) {
    const days = Math.floor(totalSec / 86400)
    const remainder = totalSec % 86400
    const hrs = Math.floor(remainder / 3600)
    const mm = Math.floor((remainder % 3600) / 60)
    const ss = remainder % 60
    return `${days}d ${hrs}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  }
  if (totalSec >= 3600) {
    const hrs = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    const ss = totalSec % 60
    return `${hrs}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  }
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${String(ss).padStart(2, "0")}`
}

/** Prefix for live pay-in countdown (YC channel deposit window). */
export const YC_PAY_IN_MAKE_PAYMENT_WITHIN_PREFIX = "Make payment within "

/** Live countdown label from remaining ms — e.g. "Make payment within 3:59:42". */
export function formatYcPayInPaymentCountdownLabel(
  remainingMs: number,
  expired = false,
): string {
  if (expired || remainingMs <= 0) {
    return YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED
  }
  return `${YC_PAY_IN_MAKE_PAYMENT_WITHIN_PREFIX}${formatYcPayInDepositTimeRemaining(remainingMs)}`
}

/** Live countdown from YC deposit expiry ISO timestamp. */
export function formatYcPayInPaymentCountdownFromExpiry(
  expiresAt: string,
  options?: { nowMs?: number },
): string {
  const endMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(endMs)) return YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED
  const nowMs = options?.nowMs ?? Date.now()
  return formatYcPayInPaymentCountdownLabel(endMs - nowMs, endMs <= nowMs)
}

/** Absolute deadline time — time-only when still today, otherwise short date + time. */
export function formatYcPayInPaymentDeadlineAt(
  expiresAt: string,
  options?: { nowMs?: number; locale?: string },
): string {
  const ms = new Date(expiresAt).getTime()
  if (!Number.isFinite(ms)) return ""

  const date = new Date(ms)
  const now = new Date(options?.nowMs ?? Date.now())
  const sameDay = date.toDateString() === now.toDateString()
  const locale = options?.locale

  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  }

  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** @deprecated Use formatYcPayInPaymentCountdownFromExpiry */
export function formatYcPayInPaymentDeadlineLabel(
  expiresAt: string,
  options?: { nowMs?: number; locale?: string },
): string {
  return formatYcPayInPaymentCountdownFromExpiry(expiresAt, options)
}

/** @deprecated Use formatYcPayInDepositTimeRemaining */
export const YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX = "Complete payment within "

/** @deprecated Use formatYcPayInDepositTimeRemaining */
export const YC_PAY_IN_AWAITING_PAYMENT_TIME_PASSED = YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED

/** @deprecated Use YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX */
export const YC_PAY_IN_PAYMENT_WINDOW_COUNTDOWN_PREFIX = YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX

/** @deprecated Use formatYcPayInPaymentCountdownLabel */
export function formatYcPayInAwaitingPaymentCountdown(remainingMs: number): string {
  return formatYcPayInPaymentCountdownLabel(remainingMs)
}

/** @deprecated Use formatYcPayInDepositTimeRemaining + YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED */
export function ycPayInAwaitingPaymentCountdownLabel(
  expired: boolean,
  remainingMs: number,
): string {
  if (expired) return YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED
  return formatYcPayInAwaitingPaymentCountdown(remainingMs)
}

/** @deprecated Use formatYcPayInAwaitingPaymentCountdown */
export const formatYcPayInPaymentWindowCountdown = formatYcPayInAwaitingPaymentCountdown

export const YC_PAY_IN_CROSS_BORDER_AWAITING_DESCRIPTION_PREFIX =
  YC_PAY_IN_CROSS_BORDER_CONFIRMING_DESCRIPTION_PREFIX

export type YcPayInPaymentDetails = {
  flowMode: "fund_balance" | "cross_border_send"
  payInRail: YcPayInRail
  transactionId: string
  transferId?: string
  localPayIn: number
  localCurrency: string
  receiveAmount?: number
  receiveCurrency?: string
  customerRate?: number
  provisionalPayIn?: number
  displayProcessingFeeLocal?: number
  bankInfo: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkName?: string
  recipientName?: string
  payInNotice?: string
  depositExpiresAt?: string
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function isYcPayInFlowMetadata(meta: Record<string, unknown>): boolean {
  const mode = String(meta.yc_mode ?? "").trim()
  return mode === "fund_balance" || mode === "cross_border_send"
}

export function readYcPayInAttestedAt(meta: Record<string, unknown> | null | undefined): string | null {
  return pickIso(meta?.payment_attested_at)
}

/** Ignore pre-attest webhook timestamps polluted by YC order-state churn. */
export function readYcPayInEffectiveProcessingAt(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  const attestedAt = readYcPayInAttestedAt(meta)
  const raw = pickIso(meta?.processing_at)
  if (!raw) return null
  if (!attestedAt) return null
  const attMs = new Date(attestedAt).getTime()
  const procMs = new Date(raw).getTime()
  if (Number.isFinite(attMs) && Number.isFinite(procMs) && procMs < attMs) return null
  return raw
}

export function readYcQuoteLockedAt(meta: Record<string, unknown> | null | undefined): string | null {
  return pickIso(meta?.quote_locked_at, meta?.transaction_started_at)
}

export function readYcPayInExpiresAt(meta: Record<string, unknown> | null | undefined): string | null {
  return pickIso(meta?.quote_expires_at, meta?.expires_at)
}

/** True while YC channel deposit window is still open (see quote_expires_at from lock). */
export function isYcPayInPaymentWindowOpen(
  meta: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const expiresAt = readYcPayInExpiresAt(meta)
  if (!expiresAt) return false
  const ms = new Date(expiresAt).getTime()
  return Number.isFinite(ms) && ms > nowMs
}

/** In-flight YC pay-in (pending/processing, not terminal). */
export function isYcPayInInFlight(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): boolean {
  if (!meta || !isYcPayInFlowMetadata(meta)) return false
  const st = String(ledgerStatus ?? "").trim().toLowerCase()
  if (st === "settled" || st === "completed" || st === "failed" || st === "cancelled") {
    return false
  }
  return st === "pending" || st === "processing" || st === "unknown"
}

/** Pending YC pay-in before user taps "I've made the payment". */
export function isYcPayInAwaitingAttestation(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): boolean {
  if (!meta || !isYcPayInFlowMetadata(meta)) return false
  const st = String(ledgerStatus ?? "").trim().toLowerCase()
  if (st === "settled" || st === "completed" || st === "failed" || st === "cancelled") {
    return false
  }
  if (readYcPayInAttestedAt(meta)) return false
  return st === "pending" || st === "processing" || st === "unknown"
}

/** User-facing "When" on detail — attestation time after CTA; quote lock while awaiting. */
export function resolveYcPayInUserWhenAt(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null
  return readYcPayInAttestedAt(meta) ?? readYcQuoteLockedAt(meta)
}

/** List / feed timestamp — attestation time when present, otherwise quote lock. */
export function resolveYcPayInListWhenAt(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): string | null {
  return resolveYcPayInUserWhenAt(meta) ?? readYcQuoteLockedAt(meta)
}

/** Feed status override for in-flight YC pay-ins — list shows Processing payment; detail lifecycle uses Confirming payment. */
export function resolveYcPayInFeedStatus(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): string | null {
  if (isYcPayInInFlight(meta, ledgerStatus)) return YC_PAY_IN_LIST_STATUS
  return null
}

export function ledgerTransactionStatusDisplayForRow(
  ledgerStatus: string,
  meta?: Record<string, unknown> | null,
): LedgerTransactionStatusDisplay {
  const feedStatus = resolveYcPayInFeedStatus(meta, ledgerStatus)
  if (feedStatus) return ledgerTransactionStatusDisplay(feedStatus)
  return ledgerTransactionStatusDisplay(ledgerStatus)
}

export function resolveYcPayInPaymentDetails(
  meta: Record<string, unknown> | null | undefined,
  options?: { easnerTransactionId?: string | null },
): YcPayInPaymentDetails | null {
  if (!meta || !isYcPayInFlowMetadata(meta)) return null

  const mode = String(meta.yc_mode ?? "").trim() as "fund_balance" | "cross_border_send"
  const depositReview = asRecord(meta.deposit_review)
  const payInReview = asRecord(meta.pay_in_review)
  const payoutReview = asRecord(meta.payout_review)

  const localPayIn = Number(
    meta.local_pay_in ??
      depositReview?.local_pay_in ??
      payInReview?.local_pay_in ??
      payoutReview?.you_send_amount ??
      0,
  )
  const localCurrency = String(
    meta.local_currency ??
      depositReview?.local_currency ??
      payInReview?.local_currency ??
      payoutReview?.send_currency ??
      "",
  ).trim()

  if (!(localPayIn > 0) || !localCurrency) return null

  const payInRailRaw = String(
    meta.pay_in_rail ?? payInReview?.pay_in_rail ?? depositReview?.pay_in_rail ?? "bank_transfer",
  ).trim()
  const payInRail: YcPayInRail =
    payInRailRaw === "mobile_money" ? "mobile_money" : "bank_transfer"

  const bankInfo =
    asRecord(meta.yc_bank_info) ??
    asRecord(meta.bank_info) ??
    null

  const transactionId = String(
    options?.easnerTransactionId ??
      meta.easner_transaction_id ??
      meta.easnerTransactionId ??
      "",
  ).trim()

  return {
    flowMode: mode,
    payInRail,
    transactionId,
    transferId: String(meta.yc_transfer_id ?? "").trim() || undefined,
    localPayIn,
    localCurrency,
    receiveAmount: Number(
      meta.usd_credit ??
        meta.receive_amount ??
        depositReview?.usd_credit ??
        payoutReview?.receive_amount ??
        0,
    ) || undefined,
    receiveCurrency: String(
      meta.receive_currency ??
        depositReview?.local_currency ??
        payoutReview?.receive_currency ??
        (mode === "fund_balance" ? "USD" : ""),
    ).trim() || undefined,
    customerRate: Number(meta.customer_rate ?? depositReview?.exchange_rate ?? payInReview?.exchange_rate ?? 0) || undefined,
    provisionalPayIn: Number(meta.provisional_pay_in ?? depositReview?.provisional_pay_in ?? 0) || undefined,
    displayProcessingFeeLocal:
      Number(meta.display_processing_fee_local ?? depositReview?.display_processing_fee_local ?? payInReview?.display_processing_fee_local ?? 0) ||
      undefined,
    bankInfo,
    sourcePhone: String(meta.source_phone ?? "").trim() || undefined,
    sourceNetworkName: String(meta.source_network_name ?? "").trim() || undefined,
    recipientName: String(
      meta.recipient_name ??
        (asRecord(meta.recipient_snapshot)?.full_name as string | undefined) ??
        "",
    ).trim() || undefined,
    payInNotice: String(meta.yc_pay_in_notice ?? meta.pay_in_notice ?? "").trim() || undefined,
    depositExpiresAt: readYcPayInExpiresAt(meta) ?? undefined,
  }
}

export type YcPayInLifecycleStepId = "confirming_payment" | "completed" | "failed"

export type YcPayInLifecycleStep = {
  id: YcPayInLifecycleStepId
  title: string
  description: string
  state: "complete" | "current" | "upcoming"
  occurredAt: string | null
  /** When true, UI renders description prefix + underlined link + suffix. */
  showPaymentDetailsLink?: boolean
}

export type BuildYcPayInLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  settledAt?: string | null
  crossBorder?: boolean
  completedDescription?: string
  processingDescription?: string
  failedDescription?: string
  nowMs?: number
}

function normalizeLedgerStatus(status: string): string {
  const s = String(status || "").trim().toLowerCase()
  if (s === "settled") return "settled"
  if (s === "failed" || s === "cancelled") return "failed"
  if (s === "pending" || s === "processing") return "processing"
  return s || "processing"
}

function buildConfirmingDescription(input: {
  meta: Record<string, unknown>
  crossBorder: boolean
  nowMs: number
  attestedAt: string | null
}): Pick<YcPayInLifecycleStep, "description" | "showPaymentDetailsLink"> {
  const expiresAt = readYcPayInExpiresAt(input.meta)
  const windowClosed =
    Boolean(expiresAt) && !isYcPayInPaymentWindowOpen(input.meta, input.nowMs)
  const hasPaymentDetails = Boolean(resolveYcPayInPaymentDetails(input.meta))

  if (input.attestedAt) {
    return {
      description: input.crossBorder
        ? YC_PAY_IN_CROSS_BORDER_CONFIRMING_BANK_WAITING_DESCRIPTION
        : YC_PAY_IN_CONFIRMING_BANK_WAITING_DESCRIPTION,
      showPaymentDetailsLink: false,
    }
  }

  if (windowClosed) {
    return {
      description: YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
      showPaymentDetailsLink: false,
    }
  }

  if (hasPaymentDetails) {
    return {
      description: input.crossBorder
        ? YC_PAY_IN_CROSS_BORDER_CONFIRMING_DESCRIPTION_PREFIX
        : YC_PAY_IN_CONFIRMING_DESCRIPTION_PREFIX,
      showPaymentDetailsLink: true,
    }
  }

  return {
    description: YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
    showPaymentDetailsLink: false,
  }
}

/** Two-step tracker: confirming payment → completed (failed replaces completed). */
export function buildYcPayInLifecycle(input: BuildYcPayInLifecycleInput): YcPayInLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const attestedAt = readYcPayInAttestedAt(meta)
  const quoteLockedAt = readYcQuoteLockedAt(meta)
  const completedAt = pickIso(meta.completed_at) ?? input.settledAt ?? null
  const failedAt = pickIso(meta.failed_at) ?? null
  const crossBorder = input.crossBorder === true
  const nowMs = input.nowMs ?? Date.now()

  const confirmingCopy = buildConfirmingDescription({
    meta,
    crossBorder,
    nowMs,
    attestedAt,
  })

  const confirmingOccurredAt = attestedAt ?? quoteLockedAt

  const confirmingStep = (state: YcPayInLifecycleStep["state"]): YcPayInLifecycleStep => ({
    id: "confirming_payment",
    title: YC_PAY_IN_CONFIRMING_STEP_TITLE,
    description: confirmingCopy.description,
    state,
    occurredAt: confirmingOccurredAt,
    showPaymentDetailsLink: confirmingCopy.showPaymentDetailsLink,
  })

  const completedDescription =
    input.completedDescription ??
    (crossBorder ? "Transfer completed." : "Funds are now available in your account balance.")

  const failedDescription =
    input.failedDescription ??
    "This payment could not be completed. Please contact support with your transaction reference."

  if (ledgerStatus === "failed") {
    return [
      confirmingStep("complete"),
      {
        id: "failed",
        title: "Failed",
        description: failedDescription,
        state: "current",
        occurredAt: failedAt,
      },
    ]
  }

  if (ledgerStatus === "settled") {
    return [
      confirmingStep("complete"),
      {
        id: "completed",
        title: "Completed",
        description: completedDescription,
        state: "complete",
        occurredAt: completedAt,
      },
    ]
  }

  return [
    confirmingStep("current"),
    {
      id: "completed",
      title: "Completed",
      description: completedDescription,
      state: "upcoming",
      occurredAt: null,
    },
  ]
}
