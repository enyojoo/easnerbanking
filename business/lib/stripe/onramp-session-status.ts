export function normalizeStripeOnrampSessionStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase()
}

export function isStripeOnrampFulfilledStatus(status: string): boolean {
  return (
    status === "fulfillment_complete" ||
    status === "fulfilled" ||
    status === "complete" ||
    status.includes("fulfillment_complete")
  )
}

export function isStripeOnrampFailedStatus(status: string): boolean {
  return status.includes("fail") || status.includes("expired") || status.includes("cancel")
}

export function mapStripeOnrampSessionToLedgerStatus(status: string): "processing" | "settled" | "failed" {
  if (isStripeOnrampFulfilledStatus(status)) return "settled"
  if (isStripeOnrampFailedStatus(status)) return "failed"
  return "processing"
}
