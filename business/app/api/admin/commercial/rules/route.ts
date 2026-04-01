import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("pricing_rules").select("*").order("priority", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const feeKind = String(body?.fee_kind || "")
  if (!feeKind) return NextResponse.json({ error: "fee_kind is required" }, { status: 400 })
  const { data, error } = await admin.from("pricing_rules").insert(body || {}).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}
