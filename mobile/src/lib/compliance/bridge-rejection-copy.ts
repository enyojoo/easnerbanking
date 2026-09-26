/** Customer-facing Bridge rejection reasons (same shape as Office bridgeRejectionCopy). */

function uniqueJoin(values: string[]): string | null {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  return unique.length ? unique.join('; ') : null
}

export function bridgeCustomerRejectionReason(value: unknown): string | null {
  const rows = Array.isArray(value) ? value : []
  const customer: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const reason = String((row as { reason?: unknown }).reason ?? '').trim()
    if (reason) customer.push(reason)
  }
  return uniqueJoin(customer)
}
