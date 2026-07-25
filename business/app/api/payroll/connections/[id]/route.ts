import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { maskPayrollMethod } from "@/lib/payroll/personal-payroll"
import {
  PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT,
  PERSONAL_PAYROLL_METHOD_SELECT,
} from "@/lib/payroll/personal-connection-selects"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin.from("payroll_connections")
    .select(PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT)
    .eq("id", id).eq("user_id", auth.user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  const { data: methodRows, error: methodsError } = await admin
    .from("payroll_payment_methods")
    .select(PERSONAL_PAYROLL_METHOD_SELECT)
    .eq("connection_id", row.id)
    .eq("status", "active")
  if (methodsError) {
    return NextResponse.json({ error: methodsError.message }, { status: 500 })
  }
  const methods = ((methodRows ?? []) as Array<Record<string, unknown>>)
    .filter((method) => method.status === "active")
    .map((method) => ({
      id: String(method.id),
      type: String(method.type),
      label: String(method.label),
      maskedDetails: maskPayrollMethod(method),
      preferred: String(row.preferred_method_id) === String(method.id),
      ownerType: String(method.owner_type),
      status: String(method.status),
    }))
  const [{ data: lines }, { data: person }] = await Promise.all([
    admin.from("payroll_lines")
      .select("id,amount_cents,pay_currency,status,settled_at,payroll_documents(*)")
      .eq("person_id", row.person_id)
      .order("created_at", { ascending: false }),
    admin.from("payroll_people")
      .select("readiness_status")
      .eq("id", row.person_id)
      .maybeSingle(),
  ])
  return NextResponse.json({
    connection: {
      id: String(row.id),
      businessId: String(row.business_id),
      businessName: String((row.businesses as Record<string, unknown>)?.name || "Easner Business"),
      businessLogoUrl: (row.businesses as Record<string, unknown>)?.logo_url ?? null,
      businessVerified: String((row.businesses as Record<string, unknown>)?.noah_kyb_status || "").toLowerCase() === "approved",
      personId: String(row.person_id),
      status: String(row.status),
      approvedAt: row.approved_at,
      revokedAt: row.revoked_at,
      sharedIdentity: row.shared_identity ?? {},
      methods,
      preferredMethod: methods.find((method) => method.preferred) ?? null,
      readinessStatus: person?.readiness_status ?? null,
      paymentHistory: (lines ?? []).map((line) => ({
        lineId: String(line.id),
        businessName: String((row.businesses as Record<string, unknown>)?.name || "Easner Business"),
        amount: Number(line.amount_cents ?? 0) / 100,
        currency: String(line.pay_currency || "USD"),
        status: String(line.status),
        paidAt: line.settled_at,
        document: Array.isArray(line.payroll_documents)
          ? line.payroll_documents[0] ?? null
          : line.payroll_documents ?? null,
      })),
    },
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: connection } = await admin.from("payroll_connections")
    .select("business_id,person_id,status").eq("id", id).eq("user_id", auth.user.id).maybeSingle()
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  const now = new Date().toISOString()
  await admin.from("payroll_connections").update({
    status: "revoked", revoked_at: now, updated_at: now,
  }).eq("id", id)
  await admin.from("payroll_people").update({
    connection_status: "revoked", readiness_status: "connection_revoked", updated_at: now,
  }).eq("id", connection.person_id)
  const { data: affectedLines } = await admin.from("payroll_lines")
    .select("run_id")
    .eq("person_id", connection.person_id)
    .in("status", ["pending", "quoting", "locked"])
  await admin.from("payroll_lines").update({
    status: "skipped",
    error_code: "connection_revoked",
    error_message: "Employee revoked payroll approval.",
    updated_at: now,
  }).eq("person_id", connection.person_id).in("status", ["pending", "quoting", "locked"])
  const affectedRunIds = [...new Set((affectedLines ?? []).map((line) => String(line.run_id)))]
  if (affectedRunIds.length > 0) {
    await admin.from("payroll_runs").update({
      status: "needs_reapproval",
      updated_at: now,
    }).in("id", affectedRunIds).in("status", ["pending_approval", "approved", "scheduled"])
  }
  await admin.from("payroll_run_events").insert({
    business_id: connection.business_id, person_id: connection.person_id,
    actor_user_id: auth.user.id, event_type: "connection.revoked", data: { affectedRunIds },
  })
  return NextResponse.json({ ok: true })
}
