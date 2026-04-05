import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { batchResolveBusinessOwners } from "@/lib/admin/org-owner-batch"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = data ?? []
  const ids = list.map((o: { id: string }) => o.id).filter(Boolean)
  const owners = await batchResolveBusinessOwners(admin, ids)
  const businesses = list.map((o: { id: string }) => {
    const oi = owners.get(o.id) ?? { owner_user_id: null, owner_email: null, owner_name: null }
    return { ...o, ...oi }
  })

  return NextResponse.json({ businesses })
}
