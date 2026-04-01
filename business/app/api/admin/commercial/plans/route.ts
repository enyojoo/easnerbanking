import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("pricing_plans").select("*").order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plans: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as
    | { code?: string; name?: string; planType?: string; isActive?: boolean; metadata?: Record<string, unknown> }
    | null
  const code = String(body?.code || "").trim().toLowerCase()
  const name = String(body?.name || "").trim()
  if (!code || !name) return NextResponse.json({ error: "code and name are required" }, { status: 400 })
  const { data, error } = await admin
    .from("pricing_plans")
    .insert({
      code,
      name,
      plan_type: body?.planType || "individual",
      is_active: body?.isActive ?? true,
      metadata: body?.metadata || {},
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}
