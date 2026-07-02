/**
 * Two-step stablecoin deposit lifecycle (Processing → Completed), mirroring the
 * bank deposit tracker copy/voice for a consistent deposit UX.
 */

import { appendLifecycleDuration } from "./transaction-timing-display"

export type StablecoinDepositLifecycleStepId = "processing" | "completed" | "failed"
export type StablecoinDepositLifecycleStepState = "complete" | "current" | "upcoming"

export type StablecoinDepositLifecycleStep = {
  id: StablecoinDepositLifecycleStepId
  title: string
  description: string
  state: StablecoinDepositLifecycleStepState
  occurredAt: string | null
}

export const STABLECOIN_DEPOSIT_PROCESSING_DESCRIPTION =
  "We're confirming your deposit on-chain."

export const STABLECOIN_DEPOSIT_COMPLETED_DESCRIPTION =
  "Funds are now available in your account balance."

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

export type BuildStablecoinDepositLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  settledAt?: string | null
}

export function buildStablecoinDepositLifecycle(
  input: BuildStablecoinDepositLifecycleInput,
): StablecoinDepositLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const processingAt =
    readIso(meta, "processing_at") ?? readIso(meta, "detected_at") ?? input.createdAt ?? null
  const completedAt =
    readIso(meta, "on_chain_settled_at") ??
    readIso(meta, "completed_at") ??
    input.settledAt ??
    null
  const failedAt = readIso(meta, "failed_at") ?? null

  if (ledgerStatus === "failed") {
    return [
      {
        id: "processing",
        title: "Processing",
        description: STABLECOIN_DEPOSIT_PROCESSING_DESCRIPTION,
        state: "complete",
        occurredAt: processingAt,
      },
      {
        id: "failed",
        title: "Failed",
        description:
          "This deposit could not be posted to your account. Please contact support with your transaction reference.",
        state: "current",
        occurredAt: failedAt,
      },
    ]
  }

  const isSettled = ledgerStatus === "settled"
  const processingState: StablecoinDepositLifecycleStepState = isSettled ? "complete" : "current"
  const completedState: StablecoinDepositLifecycleStepState = isSettled ? "complete" : "upcoming"

  return [
    {
      id: "processing",
      title: "Processing",
      description: STABLECOIN_DEPOSIT_PROCESSING_DESCRIPTION,
      state: processingState,
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: isSettled
        ? appendLifecycleDuration(
            STABLECOIN_DEPOSIT_COMPLETED_DESCRIPTION,
            processingAt,
            completedAt,
          )
        : STABLECOIN_DEPOSIT_COMPLETED_DESCRIPTION,
      state: completedState,
      occurredAt: isSettled ? completedAt : null,
    },
  ]
}
