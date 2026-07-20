/**
 * YC pay-in UX: distinguish quote lock, user attestation, and webhook processing.
 */

import type { YcPayInRail } from "../yc-pay-in-copy"
import type { LedgerTransactionStatusDisplay } from "./ledger-status-display"
import { ledgerTransactionStatusDisplay } from "./ledger-status-display"

export const YC_PAY_IN_AWAITING_STATUS = "awaiting_payment"

/** Unified hero / list status pill copy for unattested YC pay-ins. */
export const YC_PAY_IN_AWAITING_STATUS_LABEL = "Awaiting payment"

/** Lifecycle step 1 title — matches hero/list status. */
export const YC_PAY_IN_AWAITING_STEP_TITLE = "Awaiting payment"

export const YC_PAY_IN_AWAITING_DESCRIPTION_PREFIX =
  "Complete the transfer using the payment details "
export const YC_PAY_IN_AWAITING_DESCRIPTION_LINK = "here"
export const YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX = "."
export const YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED =
  "The time to complete this transfer has passed — contact support with your transaction ID."

/** Bare deposit countdown (e.g. 4:32, 2h 15m) — no prefix. */
export function formatYcPayInDepositTimeRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000))
  if (totalSec >= 86400) {
    const days = Math.floor(totalSec / 86400)
    const hrs = Math.floor((totalSec % 86400) / 3600)
    return `${days}d ${hrs}h`
  }
  if (totalSec >= 3600) {
    const hrs = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    return `${hrs}h ${mm}m`
  }
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${String(ss).padStart(2, "0")}`
}

/** @deprecated Use formatYcPayInDepositTimeRemaining */
export const YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX = "Complete payment within "

/** @deprecated Use formatYcPayInDepositTimeRemaining */
export const YC_PAY_IN_AWAITING_PAYMENT_TIME_PASSED = YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED

/** @deprecated Use YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX */
export const YC_PAY_IN_PAYMENT_WINDOW_COUNTDOWN_PREFIX = YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX

/** @deprecated Use formatYcPayInDepositTimeRemaining */
export function formatYcPayInAwaitingPaymentCountdown(remainingMs: number): string {
  return `${YC_PAY_IN_COMPLETE_PAYMENT_WITHIN_PREFIX}${formatYcPayInDepositTimeRemaining(remainingMs)}`
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
  "Send the exact amount using the payment details "

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

/** User-facing "When" on detail — never quote lock time after attestation. */
export function resolveYcPayInUserWhenAt(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null
  return pickIso(meta.payment_attested_at, meta.processing_at, meta.completed_at)
}

/** List / feed timestamp — attestation time when present, otherwise quote lock. */
export function resolveYcPayInListWhenAt(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): string | null {
  return resolveYcPayInUserWhenAt(meta) ?? readYcQuoteLockedAt(meta)
}

/** Feed status override for unattested YC pay-ins. */
export function resolveYcPayInFeedStatus(
  meta: Record<string, unknown> | null | undefined,
  ledgerStatus: string,
): string | null {
  if (isYcPayInAwaitingAttestation(meta, ledgerStatus)) return YC_PAY_IN_AWAITING_STATUS
  return null
}

export function ledgerTransactionStatusDisplayForRow(
  ledgerStatus: string,
  meta?: Record<string, unknown> | null,
): LedgerTransactionStatusDisplay {
  if (resolveYcPayInFeedStatus(meta, ledgerStatus) === YC_PAY_IN_AWAITING_STATUS) {
    return { label: YC_PAY_IN_AWAITING_STATUS_LABEL, tone: "pending" }
  }
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

export type YcPayInLifecycleStepId = "awaiting_transfer" | "processing" | "completed" | "failed"

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

function buildAwaitingDescription(input: {
  meta: Record<string, unknown>
  crossBorder: boolean
  nowMs: number
}): Pick<YcPayInLifecycleStep, "description" | "showPaymentDetailsLink"> {
  const awaitingAttestation = isYcPayInAwaitingAttestation(input.meta, "pending")
  const expiresAt = readYcPayInExpiresAt(input.meta)
  const windowClosed =
    Boolean(expiresAt) && !isYcPayInPaymentWindowOpen(input.meta, input.nowMs)
  const hasPaymentDetails = Boolean(resolveYcPayInPaymentDetails(input.meta))

  if (windowClosed) {
    return {
      description: YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
      showPaymentDetailsLink: false,
    }
  }

  if (awaitingAttestation && hasPaymentDetails) {
    const prefix = input.crossBorder
      ? YC_PAY_IN_CROSS_BORDER_AWAITING_DESCRIPTION_PREFIX
      : YC_PAY_IN_AWAITING_DESCRIPTION_PREFIX

    return {
      description: prefix.trim(),
      showPaymentDetailsLink: true,
    }
  }

  return {
    description: YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
    showPaymentDetailsLink: false,
  }
}

/** Three-step tracker: awaiting payment → confirming → completed. */
export function buildYcPayInLifecycle(input: BuildYcPayInLifecycleInput): YcPayInLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const attestedAt = readYcPayInAttestedAt(meta)
  const quoteLockedAt = readYcQuoteLockedAt(meta)
  const processingAt = pickIso(meta.processing_at)
  const completedAt = pickIso(meta.completed_at) ?? input.settledAt ?? null
  const failedAt = pickIso(meta.failed_at) ?? null
  const crossBorder = input.crossBorder === true
  const nowMs = input.nowMs ?? Date.now()

  const awaitingCopy =
    !attestedAt && ledgerStatus !== "settled" && ledgerStatus !== "failed"
      ? buildAwaitingDescription({ meta, crossBorder, nowMs })
      : {
          description: crossBorder
            ? "Send the exact amount using the payment details we provided."
            : "Complete the transfer using the payment details we provided.",
          showPaymentDetailsLink: false,
        }

  const confirmingDescription = crossBorder
    ? "We're waiting for your bank to confirm the transfer."
    : "We're waiting for your bank to confirm the deposit."

  const processingDescription =
    input.processingDescription ??
    (crossBorder
      ? "Your transfer is being processed."
      : "Your deposit is being processed.")

  const completedDescription =
    input.completedDescription ??
    (crossBorder ? "Transfer completed." : "Funds are now available in your account balance.")

  const failedDescription =
    input.failedDescription ??
    "This payment could not be completed. Please contact support with your transaction reference."

  const awaitingStep = (state: YcPayInLifecycleStep["state"]): YcPayInLifecycleStep => ({
    id: "awaiting_transfer",
    title: YC_PAY_IN_AWAITING_STEP_TITLE,
    description: awaitingCopy.description,
    state,
    occurredAt: quoteLockedAt,
    showPaymentDetailsLink: awaitingCopy.showPaymentDetailsLink,
  })

  if (ledgerStatus === "failed") {
    return [
      awaitingStep("complete"),
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
      awaitingStep("complete"),
      {
        id: "processing",
        title: "Processing",
        description: processingDescription,
        state: "complete",
        occurredAt: processingAt ?? attestedAt,
      },
      {
        id: "completed",
        title: "Completed",
        description: completedDescription,
        state: "complete",
        occurredAt: completedAt,
      },
    ]
  }

  if (!attestedAt) {
    return [
      awaitingStep("current"),
      {
        id: "processing",
        title: "Confirming payment",
        description: confirmingDescription,
        state: "upcoming",
        occurredAt: null,
      },
      {
        id: "completed",
        title: "Completed",
        description: completedDescription,
        state: "upcoming",
        occurredAt: null,
      },
    ]
  }

  if (!processingAt) {
    return [
      awaitingStep("complete"),
      {
        id: "processing",
        title: "Confirming payment",
        description: confirmingDescription,
        state: "current",
        occurredAt: attestedAt,
      },
      {
        id: "completed",
        title: "Completed",
        description: completedDescription,
        state: "upcoming",
        occurredAt: null,
      },
    ]
  }

  return [
    awaitingStep("complete"),
    {
      id: "processing",
      title: "Processing",
      description: processingDescription,
      state: "current",
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: completedDescription,
      state: "upcoming",
      occurredAt: null,
    },
  ]
}
