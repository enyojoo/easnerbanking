/**
 * Provider failure tokens stay on ledger metadata for ops; customer email/push must not show them.
 */
export function sanitizeCustomerFacingFailureReason(
  raw: string | null | undefined,
): string | undefined {
  const s = String(raw ?? "").trim()
  if (!s) return undefined
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(s)) return undefined
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s)) return undefined
  if (/^[A-Z]{3,}$/.test(s)) return undefined
  return s
}
