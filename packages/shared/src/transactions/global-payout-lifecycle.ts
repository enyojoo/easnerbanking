import { formatMoneyDisplay } from "../format-money-display"
import type { GlobalPayoutReviewSnapshot } from "./global-payout-types"
import { appendLifecycleDuration } from "./transaction-timing-display"

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

  if (ledgerStatus === "failed") {
    return [
      {
        id: "processing",
        title: "Processing",
        description: "Your transfer is being processed.",
        state: "complete",
        occurredAt: processingAt,
      },
      {
        id: "failed",
        title: "Failed",
        description:
          "This transfer could not be completed. Please contact support with your transaction reference.",
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
      description: "Your transfer is being processed.",
      state: processingState,
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: isSettled
        ? appendLifecycleDuration(
            completedDescription,
            processingAt ?? input.createdAt ?? null,
            completedAt,
          )
        : completedDescription,
      state: completedState,
      occurredAt: isSettled ? completedAt : null,
    },
  ]
}
