import type { SupabaseClient } from "@supabase/supabase-js"
import { gridWebhookCustomerId } from "@/lib/grid/webhook-event-id"
import type { GridWebhookEvent } from "@/lib/grid/types"
import { applyAccountRestriction } from "./store"

function readComplianceStatus(raw: Record<string, unknown>): string {
  return String(
    raw.complianceStatus ??
      raw.compliance_status ??
      raw.accountStatus ??
      raw.account_status ??
      raw.status ??
      "",
  )
    .trim()
    .toUpperCase()
}

export function isGridCustomerComplianceSuspended(customer: Record<string, unknown>): boolean {
  const status = readComplianceStatus(customer)
  if (!status) return false
  if (status.includes("COMPLIANCE_SUSPENDED")) return true
  if (status === "SUSPENDED" && String(customer.suspensionReason ?? "").toLowerCase().includes("compliance")) {
    return true
  }
  return false
}

async function resolveBusinessIdForGridCustomer(
  admin: SupabaseClient,
  customerId: string,
  data?: Record<string, unknown>,
): Promise<string | null> {
  const { data: byGrid } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()
  if (byGrid?.id) return String(byGrid.id)

  const platformCustomerId = String(data?.platformCustomerId ?? data?.platform_customer_id ?? "").trim()
  if (platformCustomerId) {
    const { data: byExternal } = await admin
      .from("businesses")
      .select("id")
      .eq("external_customer_id", platformCustomerId)
      .maybeSingle()
    if (byExternal?.id) return String(byExternal.id)
  }

  return null
}

export async function maybeApplyGridComplianceRestriction(
  admin: SupabaseClient,
  input: { customer: Record<string, unknown>; event?: GridWebhookEvent; partnerEventId?: string | null },
): Promise<{ handled: boolean }> {
  if (!isGridCustomerComplianceSuspended(input.customer)) return { handled: false }

  const customerId =
    String(input.customer.id ?? "").trim() ||
    gridWebhookCustomerId(input.customer) ||
    ""
  if (!customerId) return { handled: false }

  const businessId = await resolveBusinessIdForGridCustomer(admin, customerId, input.customer)
  if (!businessId) return { handled: false }

  await applyAccountRestriction(admin, {
    subjectKind: "business",
    businessId,
    source: "grid",
    reason: "Grid compliance suspended",
    partnerEventId: input.partnerEventId ?? null,
  })

  return { handled: true }
}
