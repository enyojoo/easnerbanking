import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

type ScopeRow = {
  provider: string
  version: string
  rail: string | null
  corridor: string | null
  source_currency: string | null
  destination_currency: string | null
  fee_component: string | null
  direction: string | null
  payout_method: string | null
  country_code: string | null
}

type SchedulesFilterBuilder = {
  is: (column: string, value: null) => SchedulesFilterBuilder
  eq: (column: string, value: string) => SchedulesFilterBuilder
}

function applyNullableEq(
  q: SchedulesFilterBuilder,
  column: string,
  value: string | null
): SchedulesFilterBuilder {
  if (value === null || value === undefined) return q.is(column, null)
  return q.eq(column, value)
}

async function deactivateSameScopeSchedules(params: {
  admin: ReturnType<typeof createSupabaseAdmin>
  idToKeep: string
  scope: ScopeRow
}) {
  const { admin, idToKeep, scope } = params
  let q = admin
    .from("provider_fee_schedules")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("provider", scope.provider)
    .eq("version", scope.version)
    .eq("is_active", true)
    .neq("id", idToKeep) as unknown as SchedulesFilterBuilder

  q = applyNullableEq(q, "rail", scope.rail)
  q = applyNullableEq(q, "corridor", scope.corridor)
  q = applyNullableEq(q, "source_currency", scope.source_currency)
  q = applyNullableEq(q, "destination_currency", scope.destination_currency)
  q = applyNullableEq(q, "fee_component", scope.fee_component)
  q = applyNullableEq(q, "direction", scope.direction)
  q = applyNullableEq(q, "payout_method", scope.payout_method)
  q = applyNullableEq(q, "country_code", scope.country_code)

  await q
}

function scopeFromRow(
  data: Record<string, unknown>,
  fallbackProvider: string,
  fallbackVersion: string
): ScopeRow {
  return {
    provider: String(data.provider ?? fallbackProvider),
    version: String(data.version ?? fallbackVersion),
    rail: (data.rail as string | null) ?? null,
    corridor: (data.corridor as string | null) ?? null,
    source_currency: (data.source_currency as string | null) ?? null,
    destination_currency: (data.destination_currency as string | null) ?? null,
    fee_component: (data.fee_component as string | null) ?? null,
    direction: (data.direction as string | null) ?? null,
    payout_method: (data.payout_method as string | null) ?? null,
    country_code: (data.country_code as string | null) ?? null,
  }
}

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("provider_fee_schedules")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedules: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const provider = String(body?.provider || "noah").trim().toLowerCase()
  const version = String(body?.version || "").trim()
  if (!version) return NextResponse.json({ error: "version is required" }, { status: 400 })
  const payload = {
    provider,
    version,
    fee_component: (body?.fee_component as string) || "legacy_combined",
    direction: (body?.direction as string) || null,
    payout_method: (body?.payout_method as string) || null,
    country_code: (body?.country_code as string) || null,
    rail: (body?.rail as string) || null,
    corridor: (body?.corridor as string) || null,
    source_currency: (body?.source_currency as string) || null,
    destination_currency: (body?.destination_currency as string) || null,
    variable_fee_percent: Number(body?.variable_fee_percent ?? 0),
    variable_fee_bps: body?.variable_fee_bps != null ? Number(body.variable_fee_bps) : null,
    fixed_fee_amount: Number(body?.fixed_fee_amount ?? 0),
    local_rail_fee_amount: Number(body?.local_rail_fee_amount ?? 0),
    kyc_kyb_fee_amount: Number(body?.kyc_kyb_fee_amount ?? 0),
    iban_infra_fee_amount: Number(body?.iban_infra_fee_amount ?? 0),
    fee_currency: (body?.fee_currency as string) || "USD",
    percent_fee_base: (body?.percent_fee_base as string) || null,
    min_amount: body?.min_amount != null ? Number(body.min_amount) : null,
    max_amount: body?.max_amount != null ? Number(body.max_amount) : null,
    active_from: (body?.active_from as string) || null,
    active_to: (body?.active_to as string) || null,
    is_active: Boolean(body?.is_active ?? true),
    metadata: (body?.metadata as Record<string, unknown>) || {},
  }
  const { data, error } = await admin.from("provider_fee_schedules").insert(payload).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data?.is_active) {
    await deactivateSameScopeSchedules({
      admin,
      idToKeep: data.id as string,
      scope: scopeFromRow(data as Record<string, unknown>, provider, version),
    })
  }
  return NextResponse.json({ schedule: data })
}

export async function PATCH(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as
    | { id?: string; is_active?: boolean }
    | null
  const id = String(body?.id || "").trim()
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  const isActive = Boolean(body?.is_active)
  const { data, error } = await admin
    .from("provider_fee_schedules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (isActive && data) {
    await deactivateSameScopeSchedules({
      admin,
      idToKeep: data.id as string,
      scope: scopeFromRow(data as Record<string, unknown>, String(data.provider), String(data.version)),
    })
  }
  return NextResponse.json({ schedule: data })
}
