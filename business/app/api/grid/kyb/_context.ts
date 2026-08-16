import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { requireAuth, requireGridEnv, resolveGridBusinessContextAsync } from "../../_helpers"

function normalizeMembershipRole(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "owner") return "Owner"
  return raw
}

export async function requireKybContext(request: Request) {
  const mis = requireGridEnv()
  if (mis) return { error: mis }
  const auth = await requireAuth(request)
  if ("error" in auth) return { error: auth.error }

  const ctx = await resolveGridBusinessContextAsync(auth.user.id)
  if (!ctx.ok) return { error: ctx.response }

  const admin = createSupabaseAdmin()
  const ownerUserId = await resolveOrgOwnerUserId(admin, ctx.businessId, ctx.userId)
  const { data: membership } = await admin
    .from("business_memberships")
    .select("role,status")
    .eq("business_id", ctx.businessId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  const isOwner =
    normalizeMembershipRole(membership?.role) === "Owner" || ctx.userId === ownerUserId
  if (!isOwner) {
    return {
      error: NextResponse.json(
        { error: "Only the business owner can manage verification." },
        { status: 403 },
      ),
    }
  }

  return { admin, businessId: ctx.businessId, userId: ctx.userId }
}
