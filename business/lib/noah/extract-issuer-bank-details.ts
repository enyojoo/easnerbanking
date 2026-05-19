/** Noah `IssuerDetails` (+ optional `DisplayDetails`) → bank name / address for virtual_accounts. */

function pickString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function formatAddressObject(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === "string") {
    const s = raw.trim()
    return s || null
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const parts = [
    o.Street,
    o.street,
    o.Line1,
    o.line1,
    o.Line2,
    o.line2,
    o.City,
    o.city,
    o.State,
    o.state,
    o.Region,
    o.region,
    o.PostCode,
    o.postCode,
    o.PostalCode,
    o.postalCode,
    o.Country,
    o.country,
  ]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

export function extractIssuerBankDetails(pm: Record<string, unknown>): {
  bankName: string | null
  bankAddress: string | null
} {
  const issuer = pm.IssuerDetails as Record<string, unknown> | undefined
  const display = pm.DisplayDetails as Record<string, unknown> | undefined

  const bankName =
    pickString(issuer, "Name", "name", "BankName", "bankName") ??
    pickString(display, "BankName", "bankName", "InstitutionName", "institutionName") ??
    null

  const bankAddress =
    formatAddressObject(issuer?.Address ?? issuer?.address) ??
    pickString(issuer, "Address", "address") ??
    formatAddressObject(display?.BankAddress ?? display?.bankAddress) ??
    pickString(display, "BankAddress", "bankAddress") ??
    null

  return { bankName, bankAddress }
}
