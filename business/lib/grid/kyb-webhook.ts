import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncGridBusinessKybToSupabase } from "./sync-kyb"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import type { GridWebhookEvent } from "./types"

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function readCustomerId(event: GridWebhookEvent): string | null {
  const data = webhookData(event)
  const fromData = String(data?.customerId ?? data?.customer_id ?? "").trim()
  if (fromData) return fromData
  const fromRoot = String((event as Record<string, unknown>).customerId ?? "").trim()
  return fromRoot || null
}

async function resolveBusinessByGridCustomerId(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ businessId: string; userId: string } | null> {
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()
  if (!biz?.id) return null

  const { data: owner } = await admin
    .from("users")
    .select("id")
    .eq("easner_business_id", biz.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  return { businessId: String(biz.id), userId: String(owner?.id ?? biz.id) }
}

export async function handleGridKybWebhook(
  admin: SupabaseClient,
  event: GridWebhookEvent,
): Promise<{ handled: boolean }> {
  const type = String(event.eventType ?? event.type ?? "").trim().toUpperCase()
  if (!type.includes("CUSTOMER.KYB")) return { handled: false }

  const customerId = readCustomerId(event)
  if (!customerId) return { handled: false }

  const subject = await resolveBusinessByGridCustomerId(admin, customerId)
  if (!subject) return { handled: false }

  const { status } = await syncGridBusinessKybToSupabase({
    admin,
    businessId: subject.businessId,
    userId: subject.userId,
    customerId,
    customer: webhookData(event),
  })

  if (status === "approved") {
    await provisionAfterVerificationApproved({
      admin,
      scope: "business",
      subjectUserId: subject.userId,
      subjectBusinessId: subject.businessId,
      partnerCustomerId: customerId,
    })
  }

  return { handled: true }
}

export async function inventoryApprovedBusinessesForCutover(): Promise<
  Array<{ businessId: string; name: string | null; complianceCutoverAt: string | null }>
> {
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("businesses")
    .select("id,name,compliance_cutover_at,verification_status")
    .not("compliance_cutover_at", "is", null)
  return (data ?? []).map((row) => ({
    businessId: String(row.id),
    name: (row.name as string | null) ?? null,
    complianceCutoverAt: (row.compliance_cutover_at as string | null) ?? null,
  }))
}
