export type StoredBridgeRejection = {
  reason: string
  developer_reason: string | null
}

export type BridgeRejectionNotices = {
  stored: StoredBridgeRejection[]
  customerReasons: string[]
  complianceReasons: string[]
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))]
}

/** Public `reason` is for the customer. `developer_reason` is for compliance. */
export function parseBridgeRejectionNotices(customer: Record<string, unknown>): BridgeRejectionNotices {
  const raw = customer.rejection_reasons ?? customer.rejectionReasons
  const rows = Array.isArray(raw) ? raw : []
  const stored: StoredBridgeRejection[] = []
  const customerReasons: string[] = []
  const complianceReasons: string[] = []

  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const reason = String(record.reason ?? "").trim()
    const developer = String(record.developer_reason ?? record.developerReason ?? "").trim()
    if (!reason && !developer) continue
    stored.push({ reason, developer_reason: developer || null })
    if (reason) customerReasons.push(reason)
    if (developer) complianceReasons.push(developer)
  }

  return {
    stored,
    customerReasons: unique(customerReasons),
    complianceReasons: unique(complianceReasons),
  }
}
