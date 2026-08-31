import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getBusinessRoleForUser, type BusinessRole } from "@/lib/b2b/require-role"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId, type NoahCustomerScope } from "./customer-id"
import { readNoahScopeFromRequest } from "./resolve-noah-context"

export type NoahAccountContextAccess = "read" | "write"

export type NoahAccountContext = {
  scope: NoahCustomerScope
  customerType: "Individual" | "Business"
  noahCustomerId: string
  /** Org id for B2B Noah customer; null for individual. */
  subjectBusinessId: string | null
  /** Easner user authorized as org owner (B2B) or the consumer (individual). */
  subjectUserId: string
}

const READ_ROLES: BusinessRole[] = ["Owner", "Admin", "Member", "Viewer"]
const WRITE_ROLES: BusinessRole[] = ["Owner", "Admin", "Member"]

/**
 * For **business** scope: active org members may read; Owner/Admin/Member may write.
 * Noah `CustomerID` is `ebiz_{businesses.id}`; `subjectUserId` is always the org owner.
 * For **individual**: subject is the session user.
 */
export async function resolveNoahAccountContext(
  request: Request,
  sessionUserId: string,
  bodyTypeHint?: string,
  access: NoahAccountContextAccess = "read",
): Promise<{ ok: true; ctx: NoahAccountContext } | { ok: false; response: NextResponse }> {
  const scope = readNoahScopeFromRequest(request, bodyTypeHint)

  const admin = createSupabaseAdmin()

  if (scope !== "business") {
    const { data: userRow } = await admin
      .from("users")
      .select("noah_customer_id")
      .eq("id", sessionUserId)
      .maybeSingle()
    const stored =
      (userRow?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      ok: true,
      ctx: {
        scope: "individual",
        customerType: "Individual",
        noahCustomerId: stored || noahCustomerIdFromUserId(sessionUserId),
        subjectBusinessId: null,
        subjectUserId: sessionUserId,
      },
    }
  }

  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", sessionUserId)
    .maybeSingle()

  const orgId = userRow?.easner_business_id as string | null | undefined
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Business mode requires an organization. Complete business setup first.",
          code: "NO_ORG",
        },
        { status: 400 },
      ),
    }
  }

  const { data: membership } = await admin
    .from("business_memberships")
    .select("role,status")
    .eq("business_id", orgId)
    .eq("user_id", sessionUserId)
    .maybeSingle()

  if (membership?.status === "invited") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accept your team invitation to access business accounts.", code: "INVITE_PENDING" },
        { status: 403 },
      ),
    }
  }

  const role = await getBusinessRoleForUser(admin, sessionUserId, orgId)
  const allowedRoles = access === "write" ? WRITE_ROLES : READ_ROLES
  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this action.", code: "ROLE_DENIED" },
        { status: 403 },
      ),
    }
  }

  const ownerUserId = await resolveOrgOwnerUserId(admin, orgId, sessionUserId)

  return {
    ok: true,
    ctx: {
      scope: "business",
      customerType: "Business",
      noahCustomerId: noahCustomerIdFromBusinessId(orgId),
      subjectBusinessId: orgId,
      subjectUserId: ownerUserId,
    },
  }
}
