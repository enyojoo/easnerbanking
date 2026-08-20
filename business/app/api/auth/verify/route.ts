import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

/**
 * GET – smoke test for Phase 0: Bearer token resolves to a Supabase user; optional admin_users check.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let adminActive = false
  try {
    const admin = createSupabaseAdmin()
    const { data: row } = await admin
      .from("admin_users")
      .select("status")
      .eq("id", user.id)
      .maybeSingle()
    adminActive = row?.status === "active"
  } catch {
    adminActive = false
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    officeAdmin: adminActive,
  })
}
