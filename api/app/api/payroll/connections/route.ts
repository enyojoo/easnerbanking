import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { payrollMethodDetails } from "@/lib/payroll/personal-payroll"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import {
  PERSONAL_PAYROLL_CONNECTION_LIST_SELECT,
  PERSONAL_PAYROLL_METHOD_SELECT,
} from "@/lib/payroll/personal-connection-selects"

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
  const email = String(auth.user.email ?? "").toLowerCase()
  const now = new Date().toISOString()
  const summaryOnly = new URL(request.url).searchParams.get("summary") === "true"

  if (summaryOnly) {
    const [
      { count: pendingCount, error: pendingError },
      { count: invitationCount, error: invitationError },
      { count: connectionCount, error: connectionError },
    ] = await Promise.all([
      admin
        .from("payroll_connection_invitations")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .eq("status", "pending")
        .gt("expires_at", now),
      admin
        .from("payroll_connection_invitations")
        .select("id", { count: "exact", head: true })
        .eq("email", email),
      admin
        .from("payroll_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id),
    ])
    const summaryError = pendingError ?? invitationError ?? connectionError
    if (summaryError) {
      return NextResponse.json({ error: summaryError.message }, { status: 500 })
    }
    return NextResponse.json(
      {
        pendingCount: pendingCount ?? 0,
        hasActivity: (invitationCount ?? 0) > 0 || (connectionCount ?? 0) > 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const [
    { data, error },
    { data: pendingRows, count: pendingCount, error: pendingError },
  ] = await Promise.all([
    admin.from("payroll_connections")
      .select(PERSONAL_PAYROLL_CONNECTION_LIST_SELECT)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    admin.from("payroll_connection_invitations")
      .select("id,connection_id,business_id,person_id,status,expires_at,businesses(name,easetag,logo_url,verification_status,bridge_kyc_status),payroll_people(full_name),payroll_connections(preferred_method_id)", { count: "exact" })
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", now),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })

  const connectionIds = [...new Set([
    ...(data ?? []).map((row) => String(row.id)),
    ...(pendingRows ?? []).map((row) => String(row.connection_id)),
  ])]
  const { data: methodRows, error: methodsError } = connectionIds.length > 0
    ? await admin.from("payroll_payment_methods")
        .select(PERSONAL_PAYROLL_METHOD_SELECT)
        .in("connection_id", connectionIds)
        .eq("status", "active")
    : { data: [], error: null }
  if (methodsError) {
    return NextResponse.json({ error: methodsError.message }, { status: 500 })
  }
  const methodsByConnection = new Map<string, Array<Record<string, unknown>>>()
  for (const method of methodRows ?? []) {
    const connectionId = String(method.connection_id)
    const grouped = methodsByConnection.get(connectionId) ?? []
    grouped.push(method as Record<string, unknown>)
    methodsByConnection.set(connectionId, grouped)
  }

  const connections = (data ?? []).map((row) => {
    const business = firstRelation(row.businesses)
    const methods = (methodsByConnection.get(String(row.id)) ?? []).map((method) => ({
      id: String(method.id),
      type: String(method.type),
      label: String(method.label),
      details: payrollMethodDetails(method),
      preferred: String(row.preferred_method_id || "") === String(method.id),
      ownerType: String(method.owner_type),
      status: String(method.status),
    }))
    return {
      id: String(row.id),
      businessId: String(row.business_id),
      businessName: String(business?.name || "Easner Business"),
      businessEasetag: business?.easetag ? String(business.easetag) : null,
      businessLogoUrl: business?.logo_url ? String(business.logo_url) : null,
      businessVerified: isBusinessTier1Complete(business as Record<string, unknown>),
      personId: String(row.person_id),
      status: String(row.status),
      approvedAt: row.approved_at,
      revokedAt: row.revoked_at,
      methods,
      preferredMethod: methods.find((method) => method.preferred) ?? null,
    }
  })
  return NextResponse.json({
    connections,
    pendingCount: pendingCount ?? 0,
    pendingInvitations: (pendingRows ?? []).map((row) => {
      const connection = firstRelation(row.payroll_connections)
      const business = firstRelation(row.businesses)
      const person = firstRelation(row.payroll_people)
      const methods = methodsByConnection.get(String(row.connection_id)) ?? []
      return {
        id: String(row.id),
        connectionId: String(row.connection_id),
        businessId: String(row.business_id),
        businessName: String(business.name || "Easner Business"),
        businessEasetag: business.easetag ?? null,
        businessLogoUrl: business.logo_url ?? null,
        businessVerified: isBusinessTier1Complete(business as Record<string, unknown>),
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
          details: payrollMethodDetails(method),
          preferred: String(connection.preferred_method_id || "") === String(method.id),
          ownerType: String(method.owner_type),
          status: String(method.status),
        })),
      }
    }),
  }, { headers: { "Cache-Control": "no-store" } })
}
