import { formatTransactionWhen } from "@easner/shared"

/**
 * Presentation helpers for transaction list rows (aligned with mobile Transactions list).
 */

/** "Apr 21, 2026 • 3:45 PM" */
export function formatTransactionRowDateTime(iso: string): string {
  return formatTransactionWhen(iso)
}

/** Second line under amount on the right. */
export function transactionStatusRowPresentation(
  status: string,
  statusLabel?: string | null,
): { label: string; className: string } {
  if (statusLabel) {
    return { label: statusLabel, className: "text-muted-foreground" }
  }
  const s = status.toLowerCase()
  if (s === "confirming_payment" || s === "awaiting_payment" || s === "processing_payment") {
    return { label: "Processing", className: "text-muted-foreground" }
  }
  if (s.includes("processed") || s.includes("completed")) {
    return { label: "Completed", className: "text-emerald-600 dark:text-emerald-400" }
  }
  if (
    s.includes("pending") ||
    s.includes("processing") ||
    s.includes("awaiting") ||
    s.includes("scheduled") ||
    s.includes("received") ||
    s.includes("submitted")
  ) {
    return { label: "Processing", className: "text-muted-foreground" }
  }
  if (s.includes("failed") || s.includes("returned")) {
    return { label: "Failed", className: "text-destructive" }
  }
  if (s.includes("refunded")) {
    return { label: "Refunded", className: "text-destructive" }
  }
  if (s.includes("review")) {
    return { label: "In Review", className: "text-amber-600 dark:text-amber-500" }
  }
  if (s.includes("cancelled")) {
    return { label: "Cancelled", className: "text-muted-foreground" }
  }
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return { label, className: "text-muted-foreground" }
}
