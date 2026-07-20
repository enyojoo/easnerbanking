import { formatMoneyDisplay } from "../format-money-display"
import type { GlobalPayoutReviewSnapshot } from "./global-payout-types"
import { buildYcPayInLifecycle, isYcPayInFlowMetadata } from "./yc-pay-in-display"

export type GlobalPayoutLifecycleStepId = "processing" | "completed" | "failed"
export type GlobalPayoutLifecycleStepState = "complete" | "current" | "upcoming"

export type GlobalPayoutLifecycleStep = {
  id: GlobalPayoutLifecycleStepId
  title: string
  description: string
  state: GlobalPayoutLifecycleStepState
  occurredAt: string | null
}

export function formatGlobalPayoutCompletedDescription(
  payoutReview?: GlobalPayoutReviewSnapshot | null,
  recipientName?: string | null,
): string {
  if (payoutReview?.receive_amount != null && payoutReview.receive_currency) {
    const amount = formatMoneyDisplay(payoutReview.receive_amount, payoutReview.receive_currency)
    const name = recipientName?.trim()
    if (name) return `Sent ${amount} to ${name}`
    return `Sent ${amount}`
  }
  return "Transfer completed."
}

function readIso(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function isCrossBorderSend(meta: Record<string, unknown>): boolean {
  return String(meta.yc_mode ?? "") === "cross_border_send"
}

function crossBorderProcessingDescription(meta: Record<string, unknown>): string {
  const leg2 = String(meta.leg2_status ?? "").toLowerCase()
  if (leg2 === "in_progress" || leg2 === "complete") {
    return "Your payment was received. We're completing the transfer to the recipient."
  }
  if (readIso(meta, "leg1_settled_at") || String(meta.leg1_status ?? "").toLowerCase() === "complete") {
    return "Your payment was received. We're completing the transfer."
  }
  return "Your transfer is being processed."
}

function crossBorderFailedDescription(meta: Record<string, unknown>): string {
  const leg = String(meta.failure_leg ?? "").toLowerCase()
  if (leg === "leg1") {
    return "We couldn't receive your local payment. Please try again or contact support with your transaction reference."
  }
  if (leg === "leg2") {
    return "We received your payment but couldn't complete the transfer to the recipient. Our team will follow up — contact support with your transaction reference."
  }
  return "This transfer could not be completed. Please contact support with your transaction reference."
}

function normalizeLedgerStatus(status: string): string {
  const s = String(status || "").trim().toLowerCase()
  if (s === "settled") return "settled"
  if (s === "failed" || s === "cancelled") return "failed"
  if (s === "pending" || s === "processing") return "processing"
  return s || "processing"
}

export type BuildGlobalPayoutLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  occurredAt?: string | null
  settledAt?: string | null
  createdAt?: string | null
  payoutReview?: GlobalPayoutReviewSnapshot | null
  recipientName?: string | null
}

export function buildGlobalPayoutLifecycle(
  input: BuildGlobalPayoutLifecycleInput,
): GlobalPayoutLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const processingAt = readIso(meta, "processing_at")
  const completedAt = readIso(meta, "completed_at") ?? input.settledAt ?? null
  const failedAt =
    readIso(meta, "failed_at") ?? readIso(meta, "noah_payout_failed_at") ?? null
  const completedDescription = formatGlobalPayoutCompletedDescription(
    input.payoutReview,
    input.recipientName,
  )
  const crossBorder = isCrossBorderSend(meta)
  const processingDescription = crossBorder
    ? crossBorderProcessingDescription(meta)
    : "Your transfer is being processed."
  const failedDescription = crossBorder
    ? crossBorderFailedDescription(meta)
    : "This transfer could not be completed. Please contact support with your transaction reference."

  if (crossBorder && isYcPayInFlowMetadata(meta)) {
    return buildYcPayInLifecycle({
      status: input.status,
      metadata: meta,
      settledAt: input.settledAt ?? null,
      crossBorder: true,
      completedDescription,
      processingDescription,
      failedDescription,
    }) as GlobalPayoutLifecycleStep[]
  }

  if (ledgerStatus === "failed") {
    return [
      {
        id: "processing",
        title: "Processing",
        description: processingDescription,
        state: "complete",
        occurredAt: processingAt,
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

  const isSettled = ledgerStatus === "settled"
  const processingState: GlobalPayoutLifecycleStepState = isSettled ? "complete" : "current"
  const completedState: GlobalPayoutLifecycleStepState = isSettled ? "complete" : "upcoming"

  return [
    {
      id: "processing",
      title: "Processing",
      description: processingDescription,
      state: processingState,
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: completedDescription,
      state: completedState,
      occurredAt: isSettled ? completedAt : null,
    },
  ]
}
