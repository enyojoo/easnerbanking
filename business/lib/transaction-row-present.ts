/**
 * Presentation helpers for transaction list rows (aligned with mobile Transactions list).
 */

/** "Apr 21, 2026 • 3:45 PM" */
export function formatTransactionRowDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const month = date.toLocaleString("en-US", { month: "short" })
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${hours}:${minutes} ${ampm}`
}

/** Second line under amount on the right. */
export function transactionStatusRowPresentation(status: string): { label: string; className: string } {
  const s = status.toLowerCase()
  if (s === "confirming_payment" || s === "awaiting_payment" || s === "processing_payment") {
    return {
      label: s === "processing_payment" ? "Processing payment" : "Processing",
      className: "text-muted-foreground",
    }
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
