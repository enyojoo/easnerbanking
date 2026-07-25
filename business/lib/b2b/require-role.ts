import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"

export type BusinessRole = "Owner" | "Admin" | "Member" | "Viewer"

export function normalizeBusinessRole(role: string | null | undefined): BusinessRole {
  if (!role) return "Member"
  const value = role.toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

export type BusinessRoleContext =
  | {
      ok: true
      userId: string
      businessId: string
      role: BusinessRole
    }
  | { ok: false; response: NextResponse }

export async function getBusinessRoleForUser(
  admin: SupabaseClient,
  userId: string,
  businessId: string,
): Promise<BusinessRole> {
  const { data: membership } = await admin
    .from("business_memberships")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle()

  if (membership?.role) return normalizeBusinessRole(membership.role)

  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", userId)
    .maybeSingle()

  if (userRow?.easner_business_id === businessId) return "Owner"
  return "Member"
}

export function roleMeetsMinimum(role: BusinessRole, allowed: BusinessRole[]): boolean {
  return allowed.includes(role)
}

export async function requireBusinessRole(
  request: Request,
  allowed: BusinessRole[],
): Promise<BusinessRoleContext> {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx

  const admin = createSupabaseAdmin()
  const role = await getBusinessRoleForUser(admin, ctx.userId, ctx.businessId)

  if (!roleMeetsMinimum(role, allowed)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this action." },
        { status: 403 },
      ),
    }
  }

  return { ok: true, userId: ctx.userId, businessId: ctx.businessId, role }
}

export async function requireBusinessOrgWithRole(
  request: Request,
): Promise<BusinessRoleContext & { ok: true } | { ok: false; response: NextResponse }> {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx

  const admin = createSupabaseAdmin()
  const role = await getBusinessRoleForUser(admin, ctx.userId, ctx.businessId)
  return { ok: true, userId: ctx.userId, businessId: ctx.businessId, role }
}
