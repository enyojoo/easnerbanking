import type { SupabaseClient } from "@supabase/supabase-js"
import { applyAccountRestriction } from "./store"

const RESTRICTED_NOAH_STATUSES = new Set([
  "suspended",
  "restricted",
  "terminated",
  "blocked",
  "closed",
  "frozen",
])

function collectNoahStatusStrings(customer: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim().toLowerCase())
  }

  push(customer.Status)
  push(customer.status)
  push(customer.CustomerStatus)
  push(customer.customerStatus)

  const verifications = customer.Verifications ?? customer.verifications
  if (Array.isArray(verifications)) {
    for (const item of verifications) {
      if (item && typeof item === "object") {
        push((item as Record<string, unknown>).Status)
        push((item as Record<string, unknown>).status)
      }
    }
  } else if (verifications && typeof verifications === "object") {
    push((verifications as Record<string, unknown>).Status)
    push((verifications as Record<string, unknown>).status)
  }

  return out
}

export function isNoahCustomerRestricted(customer: Record<string, unknown>): boolean {
  return collectNoahStatusStrings(customer).some((s) => RESTRICTED_NOAH_STATUSES.has(s))
}

export async function maybeApplyNoahComplianceRestriction(
  admin: SupabaseClient,
  input: {
    customer: Record<string, unknown>
    kind: "individual" | "business"
    userId?: string
    businessId?: string
    partnerEventId?: string | null
  },
): Promise<{ handled: boolean }> {
  if (!isNoahCustomerRestricted(input.customer)) return { handled: false }

  if (input.kind === "business") {
    const businessId = String(input.businessId ?? "").trim()
    if (!businessId) return { handled: false }
    await applyAccountRestriction(admin, {
      subjectKind: "business",
      businessId,
      source: "noah",
      reason: "Noah customer restricted",
      partnerEventId: input.partnerEventId ?? null,
    })
    return { handled: true }
  }

  const userId = String(input.userId ?? "").trim()
  if (!userId) return { handled: false }
  await applyAccountRestriction(admin, {
    subjectKind: "user",
    userId,
    source: "noah",
    reason: "Noah customer restricted",
    partnerEventId: input.partnerEventId ?? null,
  })
  return { handled: true }
}
