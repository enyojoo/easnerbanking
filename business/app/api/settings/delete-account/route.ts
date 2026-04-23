import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

/**
 * Self-serve account deletion for the currently authenticated user.
 *
 * - Auth: Bearer access token (mobile/web).
 * - Behavior: Best-effort cleanup of `public.users` row, then delete Supabase Auth user.
 *
 * Note: Downstream data cleanup relies on DB FK cascades / triggers where configured.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()

  try {
    // Best-effort: remove profile row (ignore failures; may be protected by FKs).
    await admin.from("users").delete().eq("id", user.id)

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error("delete-account: auth deleteUser", error)
      const msg = (error.message || "").toLowerCase()
      // Idempotency: if the auth user is already gone, treat as success.
      if (msg.includes("not found") || msg.includes("user not found")) {
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ error: error.message || "Unable to delete account." }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("delete-account: unexpected", e)
    return NextResponse.json({ error: "Unable to delete account." }, { status: 500 })
  }
}

