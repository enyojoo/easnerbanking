import type { SupabaseClient } from "@supabase/supabase-js"

const railByMethod = {
  easetag: "easetag",
  bank: "bank",
  mobile_money: "mobile",
  stablecoin: "crypto",
} as const

/**
 * Makes the connection's preferred method authoritative for the payroll person and
 * draft lines. Submitted lines are deliberately excluded because they are immutable.
 */
export async function syncPayrollPersonReceivingMethod(
  admin: SupabaseClient,
  connectionId: string,
): Promise<void> {
  const { data: connection } = await admin
    .from("payroll_connections")
    .select("id,business_id,person_id,user_id,preferred_method_id,shared_identity")
    .eq("id", connectionId)
    .maybeSingle()
  if (!connection?.person_id || !connection.preferred_method_id) return

  const { data: method } = await admin
    .from("payroll_payment_methods")
    .select("id,type,label,masked_details,provider_recipient_id,status")
    .eq("id", connection.preferred_method_id)
    .eq("connection_id", connectionId)
    .eq("status", "active")
    .maybeSingle()
  if (!method) return

  const methodType = String(method.type) as keyof typeof railByMethod
  const rail = railByMethod[methodType]
  if (!rail) throw new Error("Unsupported payroll receiving method")

  const identity = (connection.shared_identity as Record<string, unknown> | null) ?? {}
  const providerRecipientId = method.provider_recipient_id
    ? String(method.provider_recipient_id)
    : null
  const easetag = methodType === "easetag" ? String(identity.easetag ?? "") : ""
  const ready = methodType === "easetag" ? Boolean(easetag) : Boolean(providerRecipientId)
  const recipientId = methodType === "easetag" ? null : providerRecipientId
  const paymentMethodSnapshot = {
    id: String(method.id),
    type: methodType,
    label: String(method.label || methodType),
    maskedDetails: method.masked_details ?? {},
    providerRecipientId,
  }
  const now = new Date().toISOString()
  const { data: person } = await admin.from("payroll_people")
    .select("metadata,email,type,country,full_name,easetag")
    .eq("id", connection.person_id)
    .maybeSingle()
  const recipientSnapshot = {
    fullName: identity.legalName ?? person?.full_name ?? null,
    email: person?.email ?? null,
    type: person?.type ?? "employee",
    easetag: easetag || person?.easetag || null,
    recipientId,
    country: identity.residenceCountry ?? person?.country ?? null,
    connectionId,
  }

  await admin.from("payroll_people").update({
    rail,
    recipient_id: recipientId,
    readiness_status: ready ? "ready" : "method_verification_required",
    metadata: {
      ...((person?.metadata as Record<string, unknown> | null) ?? {}),
      preferredPaymentMethod: paymentMethodSnapshot,
    },
    updated_at: now,
  }).eq("id", connection.person_id)

  const { data: draftRuns } = await admin
    .from("payroll_runs")
    .select("id")
    .eq("business_id", connection.business_id)
    .eq("status", "draft")
  const draftRunIds = (draftRuns ?? []).map((run) => String(run.id))
  if (draftRunIds.length === 0) return

  await admin.from("payroll_lines").update({
    rail,
    recipient_id: recipientId,
    recipient_snapshot: recipientSnapshot,
    payment_method_id: method.id,
    payment_method_snapshot: paymentMethodSnapshot,
    updated_at: now,
  }).eq("person_id", connection.person_id).in("run_id", draftRunIds)
}
