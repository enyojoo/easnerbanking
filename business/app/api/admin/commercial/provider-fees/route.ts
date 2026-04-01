import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

async function deactivateSameScopeSchedules(params: {
  admin: ReturnType<typeof createSupabaseAdmin>
  idToKeep: string
  provider: string
  version: string
  rail: string | null
  corridor: string | null
  sourceCurrency: string | null
  destinationCurrency: string | null
}) {
  const { admin, idToKeep, provider, version, rail, corridor, sourceCurrency, destinationCurrency } = params
  await admin
    .from("provider_fee_schedules")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("version", version)
    .eq("is_active", true)
    .is("rail", rail)
    .is("corridor", corridor)
    .is("source_currency", sourceCurrency)
    .is("destination_currency", destinationCurrency)
    .neq("id", idToKeep)
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
    rail: (body?.rail as string) || null,
    corridor: (body?.corridor as string) || null,
    source_currency: (body?.source_currency as string) || null,
    destination_currency: (body?.destination_currency as string) || null,
    variable_fee_percent: Number(body?.variable_fee_percent ?? 0),
    fixed_fee_amount: Number(body?.fixed_fee_amount ?? 0),
    local_rail_fee_amount: Number(body?.local_rail_fee_amount ?? 0),
    kyc_kyb_fee_amount: Number(body?.kyc_kyb_fee_amount ?? 0),
    iban_infra_fee_amount: Number(body?.iban_infra_fee_amount ?? 0),
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
      provider: String(data.provider || provider),
      version: String(data.version || version),
      rail: (data.rail as string | null) ?? null,
      corridor: (data.corridor as string | null) ?? null,
      sourceCurrency: (data.source_currency as string | null) ?? null,
      destinationCurrency: (data.destination_currency as string | null) ?? null,
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
      provider: String(data.provider || ""),
      version: String(data.version || ""),
      rail: (data.rail as string | null) ?? null,
      corridor: (data.corridor as string | null) ?? null,
      sourceCurrency: (data.source_currency as string | null) ?? null,
      destinationCurrency: (data.destination_currency as string | null) ?? null,
    })
  }
  return NextResponse.json({ schedule: data })
}
