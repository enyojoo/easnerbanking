export type PayrollSettlementState = "settled" | "failed" | "processing"

const SETTLED_LEDGER_STATUSES = new Set([
  "settled",
  "completed",
  "complete",
  "success",
  "succeeded",
  "paid",
])

const FAILED_LEDGER_STATUSES = new Set([
  "failed",
  "rejected",
  "cancelled",
  "canceled",
])

export function classifyPayrollSettlementStatus(
  status: string | null | undefined,
): PayrollSettlementState {
  const normalized = String(status || "").trim().toLowerCase()
  if (SETTLED_LEDGER_STATUSES.has(normalized)) return "settled"
  if (FAILED_LEDGER_STATUSES.has(normalized)) return "failed"
  return "processing"
}
