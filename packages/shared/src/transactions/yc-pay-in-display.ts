/**
 * YC pay-in UX: distinguish quote lock, user attestation, and webhook processing.
 */

import type { LedgerTransactionStatusDisplay } from "./ledger-status-display"
import { ledgerTransactionStatusDisplay } from "./ledger-status-display"

export const YC_PAY_IN_AWAITING_STATUS = "awaiting_payment"

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
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

/** User-facing "When" — never quote lock time. */
export function resolveYcPayInUserWhenAt(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null
  return pickIso(meta.payment_attested_at, meta.processing_at, meta.completed_at)
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
    return { label: "Awaiting payment", tone: "pending" }
  }
  return ledgerTransactionStatusDisplay(ledgerStatus)
}

export type YcPayInLifecycleStepId = "awaiting_transfer" | "processing" | "completed" | "failed"

export type YcPayInLifecycleStep = {
  id: YcPayInLifecycleStepId
  title: string
  description: string
  state: "complete" | "current" | "upcoming"
  occurredAt: string | null
}

export type BuildYcPayInLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  settledAt?: string | null
  /** Cross-border copy variant. */
  crossBorder?: boolean
  completedDescription?: string
  processingDescription?: string
  failedDescription?: string
}

function normalizeLedgerStatus(status: string): string {
  const s = String(status || "").trim().toLowerCase()
  if (s === "settled") return "settled"
  if (s === "failed" || s === "cancelled") return "failed"
  if (s === "pending" || s === "processing") return "processing"
  return s || "processing"
}

/** Three-step tracker: awaiting transfer → confirming → completed. */
export function buildYcPayInLifecycle(input: BuildYcPayInLifecycleInput): YcPayInLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const attestedAt = readYcPayInAttestedAt(meta)
  const quoteLockedAt = readYcQuoteLockedAt(meta)
  const processingAt = pickIso(meta.processing_at)
  const completedAt = pickIso(meta.completed_at) ?? input.settledAt ?? null
  const failedAt = pickIso(meta.failed_at) ?? null
  const crossBorder = input.crossBorder === true

  const awaitingDescription = crossBorder
    ? "Send the exact amount using the payment details we provided."
    : "Complete the transfer using the payment details we provided."

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

  if (ledgerStatus === "failed") {
    return [
      {
        id: "awaiting_transfer",
        title: "Awaiting transfer",
        description: awaitingDescription,
        state: "complete",
        occurredAt: quoteLockedAt,
      },
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
      {
        id: "awaiting_transfer",
        title: "Awaiting transfer",
        description: awaitingDescription,
        state: "complete",
        occurredAt: quoteLockedAt,
      },
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
      {
        id: "awaiting_transfer",
        title: "Awaiting transfer",
        description: awaitingDescription,
        state: "current",
        occurredAt: quoteLockedAt,
      },
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
      {
        id: "awaiting_transfer",
        title: "Awaiting transfer",
        description: awaitingDescription,
        state: "complete",
        occurredAt: quoteLockedAt,
      },
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
    {
      id: "awaiting_transfer",
      title: "Awaiting transfer",
      description: awaitingDescription,
      state: "complete",
      occurredAt: quoteLockedAt,
    },
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
