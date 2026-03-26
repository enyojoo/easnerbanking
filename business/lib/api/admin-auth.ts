import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromBearer } from "@/lib/supabase/admin"

export type OfficeAdminContext = {
  userId: string
  email: string | undefined
}

/**
 * Staff-only: valid Supabase JWT + row in public.admin_users with status active.
 */
export async function requireOfficeAdmin(request: Request): Promise<
  { ok: true; ctx: OfficeAdminContext } | { ok: false; response: NextResponse }
> {
  const user = await getUserFromBearer(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("admin_users")
    .select("id,status,email")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !row || row.status !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: { userId: user.id, email: user.email ?? row.email },
  }
}
