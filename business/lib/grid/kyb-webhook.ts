import type { SupabaseClient } from "@supabase/supabase-js"
import { parseGridPlatformCustomerId } from "@easner/shared"
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

export function gridKybWebhookOrgHints(data?: Record<string, unknown>): {
  email: string | null
  legalName: string | null
  registrationNumber: string | null
} {
  const info =
    data?.businessInfo && typeof data.businessInfo === "object"
      ? (data.businessInfo as Record<string, unknown>)
      : {}
  return {
    email: String(data?.email ?? "").trim() || null,
    legalName: String(info.legalName ?? info.tradeName ?? "").trim() || null,
    registrationNumber: String(info.registrationNumber ?? "").replace(/\s/g, "") || null,
  }
}

export function pickBusinessIdForKybOrgHints(
  rows: Array<{
    id: string
    name?: string | null
    support_email?: string | null
    registration_number?: string | null
  }>,
  hints: { email: string | null; legalName: string | null; registrationNumber: string | null },
): string | null {
  if (rows.length === 0) return null
  const email = hints.email?.trim().toLowerCase() ?? ""
  const name = String(hints.legalName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  const registration = String(hints.registrationNumber ?? "").replace(/\s/g, "")

  const scored = rows.filter((row) => {
    const rowName = String(row.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
    const rowEmail = String(row.support_email ?? "").trim().toLowerCase()
    const rowReg = String(row.registration_number ?? "").replace(/\s/g, "")
    const nameOk = Boolean(name && rowName && (rowName === name || rowName.includes(name) || name.includes(rowName)))
    const emailOk = Boolean(email && rowEmail && rowEmail === email)
    const regOk = Boolean(registration && rowReg && rowReg === registration)
    return nameOk || emailOk || regOk
  })
  if (scored.length === 1) return String(scored[0].id)
  if (scored.length === 0 && rows.length === 1) return String(rows[0].id)
  if (registration) {
    const byReg = scored.filter((row) => String(row.registration_number ?? "").replace(/\s/g, "") === registration)
    if (byReg.length === 1) return String(byReg[0].id)
  }
  if (name) {
    const byName = scored.filter((row) => {
      const rowName = String(row.name ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
      return rowName === name
    })
    if (byName.length === 1) return String(byName[0].id)
  }
  return null
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
      if (!businessId) {
        const parsed = parseGridPlatformCustomerId(platformCustomerId)
        if (parsed?.kind === "business") {
          const { data: byId } = await admin
            .from("businesses")
            .select("id")
            .eq("id", parsed.businessId)
            .maybeSingle()
          businessId = byId?.id ? String(byId.id) : null
        }
      }
    }
    if (!businessId) {
      const hints = gridKybWebhookOrgHints(data)
      const lookups: Array<{ column: string; value: string }> = []
      if (hints.registrationNumber) {
        lookups.push({ column: "registration_number", value: hints.registrationNumber })
      }
      if (hints.email) lookups.push({ column: "support_email", value: hints.email })
      if (hints.legalName) lookups.push({ column: "name", value: hints.legalName })

      for (const lookup of lookups) {
        const query = admin
          .from("businesses")
          .select("id,name,support_email,registration_number")
          .eq(lookup.column, lookup.value)
        const { data: rows } = await query
        const matched = pickBusinessIdForKybOrgHints(
          Array.isArray(rows) ? rows : rows ? [rows] : [],
          hints,
        )
        if (matched) {
          businessId = matched
          break
        }
      }
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
