import { createSupabaseAdmin } from "@/lib/supabase/admin"

function normalizeMembershipRole(role: string | null | undefined): "Owner" | "Admin" | "Member" | "Viewer" {
  const value = (role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

/** Resolve canonical org owner user id (memberships, then earliest user on org). */
export async function resolveOrgOwnerUserId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string,
  fallbackUserId: string,
): Promise<string> {
  const { data: rows, error } = await admin
    .from("business_memberships")
    .select("user_id,role,status,created_at")
    .eq("business_id", orgId)
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
    .eq("easner_business_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)

  return orgUsers?.[0]?.id ?? fallbackUserId
}

/** For webhooks: org owner user id for `transactions.user_id`, or null if unresolved. */
export async function resolveBusinessOrgOwnerUserId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
): Promise<string | null> {
  const candidate = await resolveOrgOwnerUserId(admin, businessId, "")
  const { data } = await admin.from("users").select("id").eq("id", candidate).maybeSingle()
  return (data?.id as string | undefined) ?? null
}
