import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { syncGridBusinessKybToSupabase } from "./sync-kyb"
import { provisionAfterVerificationApproved } from "@/lib/verification/provision-after-approval"
import { gridWebhookCustomerId } from "./webhook-event-id"
import type { GridWebhookEvent } from "./types"

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function readCustomerId(event: GridWebhookEvent): string | null {
  const fromData = gridWebhookCustomerId(webhookData(event))
  if (fromData) return fromData
  const fromRoot = String((event as Record<string, unknown>).customerId ?? "").trim()
  return fromRoot || null
}

async function resolveBusinessSubject(
  admin: SupabaseClient,
  customerId: string,
  data?: Record<string, unknown>,
): Promise<{ businessId: string; userId: string } | null> {
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()

  let businessId = biz?.id ? String(biz.id) : null
  if (!businessId && data) {
    const platformCustomerId = String(data.platformCustomerId ?? data.platform_customer_id ?? "").trim()
    if (platformCustomerId) {
      const { data: byExternal } = await admin
        .from("businesses")
        .select("id")
        .eq("external_customer_id", platformCustomerId)
        .maybeSingle()
      businessId = byExternal?.id ? String(byExternal.id) : null
    }
  }
  if (!businessId) return null

  const userId = await resolveOrgOwnerUserId(admin, businessId, businessId)
  return { businessId, userId }
}

export async function handleGridKybWebhook(
  admin: SupabaseClient,
  event: GridWebhookEvent,
): Promise<{ handled: boolean }> {
  const type = String(event.eventType ?? event.type ?? "").trim().toUpperCase()
  if (!type.includes("CUSTOMER.KYB")) return { handled: false }

  const data = webhookData(event)
  const customerId = readCustomerId(event)
  if (!customerId) return { handled: false }

  const subject = await resolveBusinessSubject(admin, customerId, data)
  if (!subject) return { handled: false }

  const occurredAt =
    String(
      event.createdAt ??
        (event as Record<string, unknown>).created_at ??
        (event as Record<string, unknown>).timestamp ??
        "",
    ).trim() || undefined

  const { status } = await syncGridBusinessKybToSupabase({
    admin,
    businessId: subject.businessId,
    userId: subject.userId,
    customerId,
    occurredAt,
  })

  if (status === "approved") {
    await provisionAfterVerificationApproved({
      admin,
      scope: "business",
      subjectUserId: subject.userId,
      subjectBusinessId: subject.businessId,
      partnerCustomerId: customerId,
      provider: "grid",
    })
  }

  return { handled: true }
}
