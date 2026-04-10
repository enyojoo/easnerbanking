/**
 * Map Noah verification / customer payload to legacy `noah_kyc_status` column used by mobile.
 *
 * Handles REST + webhook shapes: `Verifications` as object or array, camelCase variants, and
 * sandbox/out-of-band approvals that only appear on GET /customers/:id.
 */
function collectVerificationStatusStrings(customer: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v)
  }

  const raw = customer.Verifications ?? customer.verifications
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>
        push(o.Status ?? o.status)
      }
    }
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    push(o.Status ?? o.status)
  }

  const legacy = customer.Verification ?? customer.verification
  if (legacy && typeof legacy === "object") {
    const o = legacy as Record<string, unknown>
    push(o.Status ?? o.status)
  }

  push(customer.Status ?? customer.status)
  return out
}

export function mapNoahVerificationToKycStatus(customer: Record<string, unknown>): string {
  const statuses = collectVerificationStatusStrings(customer).map((s) => s.toLowerCase())
  if (statuses.some((s) => s.includes("approv"))) return "approved"
  if (statuses.some((s) => s.includes("declin") || s.includes("reject"))) return "rejected"
  if (statuses.some((s) => s.includes("pend") || s.includes("review"))) return "under_review"
  return "not_started"
}

/** Mobile `getCustomerStatus` / dashboard — human-readable KYC string */
export function mapNoahCustomerToMobileSummary(
  customer: Record<string, unknown>,
  customerId: string
): {
  hasCustomer: boolean
  customerId: string
  kycStatus: string
  rejectionReasons: unknown | null
} {
  return {
    hasCustomer: true,
    customerId,
    kycStatus: mapNoahVerificationToKycStatus(customer),
    rejectionReasons: null,
  }
}
