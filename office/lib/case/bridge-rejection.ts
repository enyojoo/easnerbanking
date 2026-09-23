export type BridgeRejectionCopy = {
  customer: string | null
  compliance: string | null
}

function uniqueJoin(values: string[]): string | null {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  return unique.length ? unique.join("; ") : null
}

/** Customer-facing `reason` and compliance `developer_reason` from a Bridge rejection payload. */
export function bridgeRejectionCopy(value: unknown): BridgeRejectionCopy {
  const rows = Array.isArray(value) ? value : []
  const customer: string[] = []
  const compliance: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as { reason?: unknown; developer_reason?: unknown; developerReason?: unknown }
    const reason = String(record.reason ?? "").trim()
    const developer = String(record.developer_reason ?? record.developerReason ?? "").trim()
    if (reason) customer.push(reason)
    if (developer) compliance.push(developer)
  }
  return { customer: uniqueJoin(customer), compliance: uniqueJoin(compliance) }
}
