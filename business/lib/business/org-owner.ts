import { createSupabaseAdmin } from "@/lib/supabase/admin"

function normalizeMembershipRole(role: string | null | undefined): "Owner" | "Admin" | "Member" | "Viewer" {
  const value = (role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

/**
 * Organization Tier 1 (KYB) lives on the org Owner's `users` row. Same resolution as business profile API.
 */
export async function resolveOrgOwnerUserId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string,
  fallbackUserId: string,
): Promise<string> {
  const { data: rows, error } = await admin
    .from("easner_organization_memberships")
    .select("user_id,role,status,created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })

  if (!error && rows?.length) {
    const owner = rows.find(
      (r) => normalizeMembershipRole(r.role) === "Owner" && r.status !== "invited" && r.user_id,
    )
    if (owner?.user_id) return owner.user_id as string
  }

  const { data: orgUsers } = await admin
    .from("users")
    .select("id")
    .eq("easner_organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)

  return orgUsers?.[0]?.id ?? fallbackUserId
}
