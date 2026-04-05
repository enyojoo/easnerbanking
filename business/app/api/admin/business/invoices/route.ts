import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get("businessId")

  const admin = createSupabaseAdmin()
  let q = admin.from("invoices").select("*").order("created_at", { ascending: false })
  if (businessId) {
    q = q.eq("business_id", businessId)
  }
  const { data, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invoices: data ?? [] })
}
