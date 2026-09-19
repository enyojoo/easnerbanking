import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { cancelAccountDeletion } from "@/lib/settings/account-deletion"

/**
 * Cancel a pending account closure for the currently authenticated user.
 * Also cleared automatically on successful `/api/auth/bootstrap` (sign-in).
 * Rejects if the account is already closed (`deleted_at` set).
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()

  try {
    await cancelAccountDeletion(admin, user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("cancel-account-deletion: unexpected", e)
    const msg = e instanceof Error ? e.message : "Unable to cancel account closure."
    const status = msg.includes("already closed") ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
