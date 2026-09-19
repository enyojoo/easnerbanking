import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

type PatchBody = {
  enabled?: boolean
  sort_order?: number | null
  asset_name?: string
  networks?: unknown
  provider_routing?: unknown
  metadata?: Record<string, unknown> | null
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.ctx.userId }

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled
  if (body.sort_order === null || typeof body.sort_order === "number") updates.sort_order = body.sort_order
  if (typeof body.asset_name === "string" && body.asset_name.trim()) updates.asset_name = body.asset_name.trim()
  if (body.networks !== undefined) updates.networks = body.networks
  if (body.provider_routing !== undefined) updates.provider_routing = body.provider_routing
  if (body.metadata !== undefined) updates.metadata = body.metadata

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("crypto_destinations")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ destination: data })
}
