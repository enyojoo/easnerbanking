/**
 * Map provider ledger statuses (Noah webhooks, Turnkey, etc.) to user-facing labels
 * aligned with business + mobile transaction lists.
 */

export type UserTransactionStatus = "completed" | "pending" | "processing" | "failed"

export type LedgerTransactionStatusTone =
  | "completed"
  | "pending"
  | "processing"
  | "failed"
  | "cancelled"
  | "neutral"

export type LedgerTransactionStatusDisplay = {
  label: string
  tone: LedgerTransactionStatusTone
}

/** Filter key used on business `/transactions` (ledger row mapped before compare). */
export function mapLedgerStatusToUserStatus(ledgerStatus: string): UserTransactionStatus | string {
  const st = String(ledgerStatus ?? "").trim().toLowerCase()
  if (st === "settled" || st === "completed" || st === "deposited") return "completed"
  if (st === "pending" || st === "processing") return st
  if (st === "failed" || st === "cancelled" || st === "canceled") return "failed"
  if (st === "unknown") return "pending"
  return st || "pending"
}

/** User-facing label + tone from raw ledger status (handles settled → Completed). */
export function ledgerTransactionStatusDisplay(ledgerStatus: string): LedgerTransactionStatusDisplay {
  const s = String(ledgerStatus ?? "").trim().toLowerCase()
  if (s === "settled" || s === "completed" || s === "deposited" || s.includes("processed")) {
    return { label: "Completed", tone: "completed" }
  }
  if (s === "failed" || s.includes("returned")) {
    return { label: "Failed", tone: "failed" }
  }
  if (s.includes("refunded")) {
    return { label: "Refunded", tone: "failed" }
  }
  if (s === "cancelled" || s === "canceled" || s.includes("cancelled")) {
    return { label: "Cancelled", tone: "cancelled" }
  }
  if (s === "pending" || s === "unknown") {
    return { label: "Pending", tone: "pending" }
  }
  if (
    s === "processing" ||
    s === "converting" ||
    s === "converted" ||
    s === "confirmed" ||
    s.includes("awaiting") ||
    s.includes("scheduled") ||
    s.includes("received") ||
    s.includes("submitted")
  ) {
    return { label: "Processing", tone: "processing" }
  }
  if (s.includes("review")) {
    return { label: "In Review", tone: "pending" }
  }
  const label = s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return { label, tone: "neutral" }
}

export function ledgerStatusMatchesUserFilter(ledgerStatus: string, filter: string): boolean {
  if (filter === "all") return true
  return mapLedgerStatusToUserStatus(ledgerStatus) === filter
}
