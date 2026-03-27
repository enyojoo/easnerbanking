import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("easner_organizations")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ organizations: data ?? [] })
}
