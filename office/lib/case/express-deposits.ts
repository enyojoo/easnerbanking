/** Stripe express-deposits verification, shown beside Noah / Bridge / Grid. */
export function expressDepositsOfficeStatus(raw: string | null | undefined): string {
  const status = String(raw ?? "").trim().toLowerCase()
  if (!status || status === "not_started" || status === "link") return "not_started"
  if (status === "ready" || status === "approved" || status === "complete" || status === "completed") {
    return "approved"
  }
  return status
}

export function expressDepositsTierLabel(raw: string | null | undefined): string | null {
  const tier = String(raw ?? "").trim().toLowerCase()
  if (tier === "l0" || tier === "l1" || tier === "l2") return tier.toUpperCase()
  return null
}
