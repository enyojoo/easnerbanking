function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

export function readStripeOnrampTxHash(session: Record<string, unknown>): string | null {
  const details = asMeta(session.transaction_details)
  const hash = String(
    session.transaction_hash ??
      session.destination_transaction_hash ??
      details.transaction_hash ??
      details.transaction_id ??
      "",
  ).trim()
  return hash || null
}
