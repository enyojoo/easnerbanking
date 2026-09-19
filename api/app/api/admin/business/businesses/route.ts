import { NextResponse } from "next/server"
import { computeAccountRestrictionPhase } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { batchResolveBusinessOwners } from "@/lib/admin/org-owner-batch"
import { loadActiveVelocityControlsByBusinessIds } from "@/lib/wallet-send-compliance"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = data ?? []
  const ids = list.map((o: { id: string }) => o.id).filter(Boolean)
  const owners = await batchResolveBusinessOwners(admin, ids)

  const restrictionByBusiness = new Map<
    string,
    { phase: string; windDownEndsAt: string | null; source: string | null }
  >()
  if (ids.length > 0) {
    const { data: activeRestrictions } = await admin
      .from("account_restrictions")
      .select("business_id,phase,source,restricted_at,wind_down_ends_at,locked_at")
      .eq("subject_kind", "business")
      .in("business_id", ids)
      .is("lifted_at", null)
    for (const row of activeRestrictions ?? []) {
      if (!row.business_id) continue
      restrictionByBusiness.set(String(row.business_id), {
        phase: computeAccountRestrictionPhase({
          restrictedAt: String(row.restricted_at),
          windDownEndsAt: String(row.wind_down_ends_at),
          lockedAt: row.locked_at as string | null,
        }),
        windDownEndsAt: String(row.wind_down_ends_at),
        source: row.source ? String(row.source) : null,
      })
    }
  }

  const velocityByBusiness = await loadActiveVelocityControlsByBusinessIds(admin, ids)

  const businesses = list.map((o: { id: string }) => {
    const oi = owners.get(o.id) ?? { owner_user_id: null, owner_email: null, owner_name: null }
    const restriction = restrictionByBusiness.get(o.id)
    const velocity = velocityByBusiness.get(o.id)
    return {
      ...o,
      ...oi,
      accountRestrictionPhase: restriction?.phase ?? null,
      accountRestrictionWindDownEndsAt: restriction?.windDownEndsAt ?? null,
      accountRestrictionSource:
        (restriction?.source as "grid" | "noah" | "office" | null | undefined) ?? null,
      velocityLimitActive: Boolean(velocity),
      velocityExpiresAt: velocity?.expires_at ?? null,
      velocityMaxSendUsd: velocity?.max_send_usd ?? null,
      velocitySentUsd: velocity?.sent_usd ?? null,
      velocityTriggerReason: velocity?.trigger_reason ?? null,
      velocityMode: velocity?.mode ?? null,
    }
  })

  return NextResponse.json({ businesses })
}
