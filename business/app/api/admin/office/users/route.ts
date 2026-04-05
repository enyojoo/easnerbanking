import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * Office user directory: full `public.users` rows with service role (bypasses RLS).
 * Merges `email_confirmed_at` from auth for the same users.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin.from("users").select("*").order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const authById = new Map<string, string | undefined>()
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data: batch, error: listErr } = await admin.auth.admin.listUsers({ page, perPage })
    if (listErr) {
      console.error("office users: auth list merge:", listErr.message)
      break
    }
    const users = batch?.users ?? []
    for (const u of users) {
      authById.set(u.id, u.email_confirmed_at)
    }
    if (users.length < perPage) break
    page += 1
    if (page > 100) break
  }

  const users = (rows ?? []).map((row: { id: string }) => ({
    ...row,
    email_confirmed_at: authById.get(row.id) ?? null,
  }))

  return NextResponse.json({ users })
}
