/**
 * Two-step bank deposit lifecycle for Noah ACH pay-in (Processing → Completed).
 * Bank voice: account balance, no wallet/crypto terminology.
 */

export type BankDepositLifecycleStepId = "processing" | "completed" | "failed"
export type BankDepositLifecycleStepState = "complete" | "current" | "upcoming"

export type BankDepositLifecycleStep = {
  id: BankDepositLifecycleStepId
  title: string
  description: string
  state: BankDepositLifecycleStepState
  occurredAt: string | null
}

const PROCESSING_DESCRIPTION =
  "We've received your ACH deposit and are confirming the payment."

export function formatBankDepositPostedAmount(amount: number, currency: string): string {
  const c = String(currency || "USD").trim().toUpperCase()
  const n = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
  if (c === "EUR") return `€${n.toFixed(2)}`
  if (c === "GBP") return `£${n.toFixed(2)}`
  return `$${n.toFixed(2)}`
}

function completedDescription(amount: number, currency: string): string {
  const formatted = formatBankDepositPostedAmount(amount, currency)
  return `${formatted} is now available in your account balance.`
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
  const completedAt =
    readIso(meta, "completed_at") ?? input.settledAt ?? null
  const { amount: postedAmount, currency: postedCurrency } = readPostedAmount(meta)

  if (ledgerStatus === "failed") {
    return [
      {
        id: "processing",
        title: "Processing",
        description: PROCESSING_DESCRIPTION,
        state: "complete",
        occurredAt: processingAt,
      },
      {
        id: "failed",
        title: "Unable to complete",
        description:
          "This deposit could not be posted to your account. Please contact support with your transaction reference.",
        state: "current",
        occurredAt: completedAt ?? processingAt,
      },
    ]
  }

  const isSettled = ledgerStatus === "settled"

  const processingState: BankDepositLifecycleStepState = isSettled
    ? "complete"
    : "current"

  const completedState: BankDepositLifecycleStepState = isSettled ? "complete" : "upcoming"

  return [
    {
      id: "processing",
      title: "Processing",
      description: PROCESSING_DESCRIPTION,
      state: processingState,
      occurredAt: processingAt,
    },
    {
      id: "completed",
      title: "Completed",
      description: completedDescription(postedAmount, postedCurrency),
      state: completedState,
      occurredAt: isSettled ? completedAt : null,
    },
  ]
}

export function isBankOnrampDepositFlow(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return String(metadata.flow ?? "").toLowerCase() === "bank_onramp"
}
