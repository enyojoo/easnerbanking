import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"

export const runtime = "nodejs"

/**
 * GET — wallet owner + Turnkey accounts for authorized subject only.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ ownerType: string; ownerRef: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerType, ownerRef } = await ctx.params
  const ot = ownerType === "business" ? "business" : "individual"
  if (!ownerRef || ownerRef.length < 32) {
    return NextResponse.json({ error: "Invalid ownerRef" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  if (ot === "individual") {
    if (ownerRef !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } else {
    const ownerUserId = await resolveOrgOwnerUserId(admin, ownerRef, user.id)
    if (ownerUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { data: owner, error } = await admin
    .from("wallet_owners")
    .select("id, owner_type, owner_ref, kyc_status, turnkey_sub_organization_id, wallet_accounts(*)")
    .eq("owner_type", ot)
    .eq("owner_ref", ownerRef)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ owner })
}
