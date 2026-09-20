import { NextResponse } from "next/server"
import { resolveAccountRestrictionForUserId } from "@/lib/account-restriction/store"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Self-serve Dev Platform activation. Unlocks visibility only — Console,
 * Checkout, and test-mode keys. Live-mode key creation stays gated on
 * Stripe Connect readiness in `/api/checkout/keys`, unaffected by this flag.
 * Office keeps its own toggle for manual enable/disable.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()

  const restriction = await resolveAccountRestrictionForUserId(admin, user.id)
  if (restriction.active) {
    return NextResponse.json(
      { error: "Your account is under review. Contact support for API access.", code: "ACCOUNT_RESTRICTED" },
      { status: 403 },
    )
  }

  const { error } = await admin
    .from("businesses")
    .update({ dev_platform_enabled: true })
    .eq("id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
