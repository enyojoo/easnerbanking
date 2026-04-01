import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("promo_rules").select("*").order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promos: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as
    | { code?: string; name?: string; discount_type?: string; discount_value?: number | string }
    | null
  const code = String(body?.code || "").trim().toUpperCase()
  const name = String(body?.name || "").trim()
  if (!code || !name) return NextResponse.json({ error: "code and name are required" }, { status: 400 })
  const { data, error } = await admin
    .from("promo_rules")
    .insert({
      code,
      name,
      discount_type: body?.discount_type || "percentage",
      discount_value: Number(body?.discount_value ?? 0),
      is_active: true,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promo: data })
}
