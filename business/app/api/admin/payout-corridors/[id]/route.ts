import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  loadCorridorForPreflight,
  preflightCorridorRoutingPatch,
} from "@/lib/payout-providers/corridor-routing-preflight"

type PatchBody = {
  enabled?: boolean
  sort_order?: number | null
  providers?: unknown
  country_name?: string
  settlement_backend?: string | null
  provider_routing?: unknown
  fields_schema?: Record<string, unknown> | null
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

  const updates: Record<string, unknown> = { updated_by: auth.ctx.userId }

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled
  if (body.sort_order === null || typeof body.sort_order === "number") updates.sort_order = body.sort_order
  if (body.providers !== undefined) updates.providers = body.providers
  if (typeof body.country_name === "string" && body.country_name.trim()) updates.country_name = body.country_name.trim()
  if (body.settlement_backend !== undefined) updates.settlement_backend = body.settlement_backend
  if (body.provider_routing !== undefined) updates.provider_routing = body.provider_routing
  if (body.fields_schema !== undefined) updates.fields_schema = body.fields_schema
  if (body.metadata !== undefined) updates.metadata = body.metadata

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  if (
    body.provider_routing !== undefined ||
    body.metadata !== undefined ||
    body.fields_schema !== undefined
  ) {
    const existing = await loadCorridorForPreflight(admin, id)
    const issues = preflightCorridorRoutingPatch({
      providerRouting: body.provider_routing,
      metadata: body.metadata,
      fieldsSchema: body.fields_schema,
      existing,
    })
    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: issues.map((i) => i.message).join(" "),
          code: "CORRIDOR_ROUTING_PREFLIGHT_FAILED",
          issues,
        },
        { status: 400 },
      )
    }
  }

  const { data, error } = await admin.from("payout_corridors").update(updates).eq("id", id).select("*").maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ corridor: data })
}
