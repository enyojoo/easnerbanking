import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500)

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message, entries: [] }, { status: 500 })
  }

  return NextResponse.json({ entries: data ?? [] })
}
