import { createSupabaseAdmin } from "@/lib/supabase/admin"

function normalizeMembershipRole(role: string | null | undefined): "Owner" | "Admin" | "Member" | "Viewer" {
  const value = (role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

export type OrgOwnerFields = {
  owner_user_id: string | null
  owner_email: string | null
  owner_name: string | null
}

/**
 * Batch-resolve display owner per business: prefer business_memberships Owner (not invited),
 * else earliest users row with easner_business_id = business id.
 */
export async function batchResolveBusinessOwners(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessIds: string[],
): Promise<Map<string, OrgOwnerFields>> {
  const result = new Map<string, OrgOwnerFields>()
  if (businessIds.length === 0) return result

  for (const id of businessIds) {
    result.set(id, { owner_user_id: null, owner_email: null, owner_name: null })
  }

  const { data: members, error: memErr } = await admin
    .from("business_memberships")
    .select("business_id,user_id,role,status,created_at")
    .in("business_id", businessIds)
    .order("created_at", { ascending: true })

  if (!memErr && members?.length) {
    for (const row of members) {
      const bid = String(row.business_id)
      if (!result.has(bid)) continue
      if (normalizeMembershipRole(row.role) !== "Owner") continue
      if (String(row.status || "").toLowerCase() === "invited") continue
      if (!row.user_id) continue
      const cur = result.get(bid)!
      if (cur.owner_user_id) continue
      cur.owner_user_id = String(row.user_id)
    }
  }

  const { data: bizUsers, error: userErr } = await admin
    .from("users")
    .select("id,easner_business_id,email,full_name,created_at")
    .in("easner_business_id", businessIds)
    .order("created_at", { ascending: true })

  if (!userErr && bizUsers?.length) {
    const byBusiness = new Map<string, typeof bizUsers>()
    for (const u of bizUsers) {
      const bid = u.easner_business_id as string | null
      if (!bid) continue
      if (!byBusiness.has(bid)) byBusiness.set(bid, [])
      byBusiness.get(bid)!.push(u)
    }
    for (const businessId of businessIds) {
      const cur = result.get(businessId)!
      if (cur.owner_user_id) continue
      const list = byBusiness.get(businessId)
      const first = list?.[0]
      if (first?.id) {
        cur.owner_user_id = String(first.id)
        cur.owner_email = first.email ?? null
        cur.owner_name = first.full_name ?? null
      }
    }
  }

  const needProfile = new Set<string>()
  for (const businessId of businessIds) {
    const cur = result.get(businessId)!
    if (cur.owner_user_id && (!cur.owner_email || !cur.owner_name)) {
      needProfile.add(cur.owner_user_id)
    }
  }

  if (needProfile.size > 0) {
    const { data: profiles } = await admin
      .from("users")
      .select("id,email,full_name")
      .in("id", Array.from(needProfile))

    const profileById = new Map((profiles || []).map((p) => [String(p.id), p]))
    for (const businessId of businessIds) {
      const cur = result.get(businessId)!
      if (!cur.owner_user_id) continue
      const p = profileById.get(cur.owner_user_id)
      if (p) {
        cur.owner_email = cur.owner_email ?? p.email ?? null
        cur.owner_name = cur.owner_name ?? p.full_name ?? null
      }
    }
  }

  return result
}
