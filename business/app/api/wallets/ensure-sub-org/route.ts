import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { ensureTurnkeySubOrgForEasnerOwner } from "@/lib/wallet/ensure-turnkey-sub-org"

export const runtime = "nodejs"

/**
 * POST – Create Turnkey sub-org server-side (if missing) and link to `wallet_owners`.
 * Idempotent. Use when bootstrap was skipped or Turnkey creation failed earlier.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const ownerType = acc.ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    acc.ctx.scope === "business" && acc.ctx.subjectBusinessId
      ? acc.ctx.subjectBusinessId
      : acc.ctx.subjectUserId

  const admin = createSupabaseAdmin()
  const result = await ensureTurnkeySubOrgForEasnerOwner({
    admin,
    scope: acc.ctx.scope === "business" ? "business" : "individual",
    subjectUserId: acc.ctx.subjectUserId,
    subjectBusinessId: acc.ctx.subjectBusinessId,
    noahCustomerId: acc.ctx.noahCustomerId,
    userEmail: user.email,
    displayName: user.user_metadata?.full_name as string | undefined,
  })

  if (!result.ok) {
    const status =
      result.reason === "email_required"
        ? 400
        : result.reason === "turnkey_disabled"
          ? 503
          : 502
    return NextResponse.json({ ok: false, error: result.reason }, { status })
  }

  return NextResponse.json({
    ok: true,
    subOrganizationId: result.subOrganizationId,
    created: result.created,
    ownerType,
    ownerRef,
  })
}
