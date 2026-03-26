import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

type AuthUserRow = {
  id: string
  email?: string
  email_confirmed_at?: string
}

/**
 * List auth users (paginated) for Office email_confirmed_at merge.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const users: AuthUserRow[] = []
  let page = 1
  const perPage = 1000

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error("admin auth-users:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = data.users ?? []
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
      })
    }
    if (batch.length < perPage) break
    page += 1
    if (page > 100) break
  }

  return NextResponse.json({ users })
}
