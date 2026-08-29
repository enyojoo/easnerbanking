/** Saved payout recipient id denormalized onto ledger metadata at send time. */
export function recipientIdFromLedgerMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const meta = metadata as Record<string, unknown>
  const direct = String(meta.recipient_id ?? "").trim()
  if (direct) return direct
  const ref = String(meta.destination_ref ?? "").trim()
  const prefix = "recipient:"
  if (ref.toLowerCase().startsWith(prefix)) {
    const id = ref.slice(prefix.length).trim()
    if (id) return id
  }
  return null
}
