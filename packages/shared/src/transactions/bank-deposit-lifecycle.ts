/**
 * Two-step bank deposit lifecycle for Noah fiat pay-in (Processing → Completed).
 * Bank voice: account balance, no wallet/crypto terminology.
 */

import {
  buildBankDepositProcessingDescription,
  deriveBankDepositSchemeLabel,
} from "./bank-deposit-scheme"
import {
  BANK_VERIFICATION_COMPLETED_DESCRIPTION,
  isVerificationDepositMetadata,
} from "./verification-deposit"

export type BankDepositLifecycleStepId = "processing" | "completed" | "failed"
export type BankDepositLifecycleStepState = "complete" | "current" | "upcoming"

export type BankDepositLifecycleStep = {
  id: BankDepositLifecycleStepId
  title: string
  description: string
  state: BankDepositLifecycleStepState
  occurredAt: string | null
}

/** Completed-step copy for bank deposit lifecycle and settled push (no amount). */
export const BANK_DEPOSIT_COMPLETED_DESCRIPTION =
  "Funds are now available in your account balance."

export function formatBankDepositPostedAmount(amount: number, currency: string): string {
  const c = String(currency || "USD").trim().toUpperCase()
  const n = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
  if (c === "EUR") return `€${n.toFixed(2)}`
  if (c === "GBP") return `£${n.toFixed(2)}`
  return `$${n.toFixed(2)}`
}

function completedDescription(meta: Record<string, unknown>): string {
  if (isVerificationDepositMetadata(meta)) return BANK_VERIFICATION_COMPLETED_DESCRIPTION
  return BANK_DEPOSIT_COMPLETED_DESCRIPTION
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

function readPostedAmount(meta: Record<string, unknown>): { amount: number; currency: string } {
  const raw =
    meta.posted_amount ?? meta.settled_amount ?? meta.final_amount ?? null
  const amount = typeof raw === "number" ? raw : Number(raw)
  const currency = String(meta.settled_currency ?? meta.fiat_deposit_currency ?? "USD").trim() || "USD"
  return {
    amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0,
    currency: currency.toUpperCase(),
  }
}

export type BuildBankDepositLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  occurredAt?: string | null
  settledAt?: string | null
  createdAt?: string | null
}

/**
 * Builds the 2-step vertical tracker for bank onramp pay-ins.
 */
export function buildBankDepositLifecycle(
  input: BuildBankDepositLifecycleInput,
): BankDepositLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const processingAt =
    readIso(meta, "processing_at") ?? input.occurredAt ?? input.createdAt ?? null
  const onChainSettledAt = readIso(meta, "on_chain_settled_at")
  const isVerification = isVerificationDepositMetadata(meta)
  const completedAt =
    onChainSettledAt ??
    (isVerification ? readIso(meta, "completed_at") : null) ??
    (isVerification ? input.settledAt : null) ??
    null
  const fundsAvailable =
    ledgerStatus === "settled" && (isVerification || onChainSettledAt != null)
  const failedAt =
    readIso(meta, "failed_at") ?? readIso(meta, "noah_payout_failed_at") ?? null
  const { amount: postedAmount, currency: postedCurrency } = readPostedAmount(meta)
  const schemeLabel = deriveBankDepositSchemeLabel({
    metadata: meta,
    payload: input.payload ?? null,
  })
  const processingDescription = buildBankDepositProcessingDescription(schemeLabel)

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
        description:
          "This deposit could not be posted to your account. Please contact support with your transaction reference.",
        state: "current",
        occurredAt: failedAt ?? processingAt,
      },
    ]
  }

  const processingState: BankDepositLifecycleStepState =
    fundsAvailable || ledgerStatus === "settled" ? "complete" : "current"

  const completedState: BankDepositLifecycleStepState = fundsAvailable
    ? "complete"
    : ledgerStatus === "settled"
      ? "current"
      : "upcoming"

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
      description: completedDescription(meta),
      state: completedState,
      occurredAt: fundsAvailable ? completedAt : null,
    },
  ]
}

export function isBankOnrampDepositFlow(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return String(metadata.flow ?? "").toLowerCase() === "bank_onramp"
}
