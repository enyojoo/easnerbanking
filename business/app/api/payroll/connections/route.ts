import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { maskPayrollMethod } from "@/lib/payroll/personal-payroll"
import { PERSONAL_PAYROLL_CONNECTION_LIST_SELECT } from "@/lib/payroll/personal-connection-selects"

function firstRelation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? {}
  }
  return (value as Record<string, unknown> | null) ?? {}
}

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const admin = createSupabaseAdmin()
  const [{ data, error }, { data: pendingRows, count: pendingCount }] = await Promise.all([
    admin.from("payroll_connections")
    .select(PERSONAL_PAYROLL_CONNECTION_LIST_SELECT)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false }),
    admin.from("payroll_connection_invitations")
      .select("id,connection_id,business_id,person_id,status,expires_at,businesses(name,easetag,logo_url,noah_kyb_status),payroll_people(full_name),payroll_connections(preferred_method_id,payroll_payment_methods(id,type,label,masked_details,owner_type,status))", { count: "exact" })
      .eq("email", String(auth.user.email ?? "").toLowerCase())
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const connections = (data ?? []).map((row) => {
    const business = firstRelation(row.businesses)
    const methods = (row.payroll_payment_methods as Array<Record<string, unknown>> ?? [])
      .filter((method) => method.status === "active")
    const preferred = methods.find((method) => String(method.id) === String(row.preferred_method_id))
    return {
      id: String(row.id),
      businessId: String(row.business_id),
      businessName: String(business?.name || "Easner Business"),
      businessEasetag: business?.easetag ? String(business.easetag) : null,
      businessLogoUrl: business?.logo_url ? String(business.logo_url) : null,
      businessVerified: String(business?.noah_kyb_status || "").toLowerCase() === "approved",
      personId: String(row.person_id),
      status: String(row.status),
      approvedAt: row.approved_at,
      revokedAt: row.revoked_at,
      preferredMethod: preferred ? {
        id: String(preferred.id),
        type: String(preferred.type),
        label: String(preferred.label),
        maskedDetails: maskPayrollMethod(preferred),
        preferred: true,
        ownerType: String(preferred.owner_type),
        status: String(preferred.status),
      } : null,
    }
  })
  return NextResponse.json({
    connections,
    pendingCount: pendingCount ?? 0,
    pendingInvitations: (pendingRows ?? []).map((row) => {
      const connection = firstRelation(row.payroll_connections)
      const business = firstRelation(row.businesses)
      const person = firstRelation(row.payroll_people)
      const methods = ((connection?.payroll_payment_methods as Array<Record<string, unknown>>) ?? [])
        .filter((method) => method.status === "active")
      return {
        id: String(row.id),
        connectionId: String(row.connection_id),
        businessId: String(row.business_id),
        businessName: String(business.name || "Easner Business"),
        businessEasetag: business.easetag ?? null,
        businessLogoUrl: business.logo_url ?? null,
        businessVerified: String(business.noah_kyb_status || "").toLowerCase() === "approved",
        personName: String(person.full_name || "Payroll recipient"),
        status: String(row.status),
        expiresAt: String(row.expires_at),
        sharedFields: [
          "Legal name", "Residence country", "Profile photo", "EASETAG", "Verification status and date",
        ],
        methods: methods.map((method) => ({
          id: String(method.id),
          type: String(method.type),
          label: String(method.label),
          maskedDetails: maskPayrollMethod(method),
          preferred: String(connection.preferred_method_id || "") === String(method.id),
          ownerType: String(method.owner_type),
          status: String(method.status),
        })),
      }
    }),
  }, { headers: { "Cache-Control": "no-store" } })
}
