import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { noahCustomerIdFromUserId, type NoahCustomerScope } from "./customer-id"
import { resolveNoahContext } from "./resolve-noah-context"

export type NoahAccountContext = {
  scope: NoahCustomerScope
  customerType: "Individual" | "Business"
  noahCustomerId: string
  /** Easner user id that owns the Noah customer (org owner for business when org exists). */
  subjectUserId: string
}

/**
 * For **business** scope: only the organization owner may call; Noah customer id uses the **owner's** user id.
 * For **individual**: subject is the session user.
 */
export async function resolveNoahAccountContext(
  request: Request,
  sessionUserId: string,
  bodyTypeHint?: string,
): Promise<{ ok: true; ctx: NoahAccountContext } | { ok: false; response: NextResponse }> {
  const base = resolveNoahContext(sessionUserId, request, bodyTypeHint)

  if (base.scope !== "business") {
    return {
      ok: true,
      ctx: {
        ...base,
        subjectUserId: sessionUserId,
      },
    }
  }

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("easner_organization_id")
    .eq("id", sessionUserId)
    .maybeSingle()

  const orgId = userRow?.easner_organization_id as string | null | undefined
  if (!orgId) {
    return {
      ok: true,
      ctx: {
        scope: "business",
        customerType: "Business",
        noahCustomerId: noahCustomerIdFromUserId(sessionUserId, "business"),
        subjectUserId: sessionUserId,
      },
    }
  }

  const ownerUserId = await resolveOrgOwnerUserId(admin, orgId, sessionUserId)
  if (ownerUserId !== sessionUserId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only the organization owner can access business accounts.", code: "OWNER_ONLY" },
        { status: 403 },
      ),
    }
  }

  return {
    ok: true,
    ctx: {
      scope: "business",
      customerType: "Business",
      noahCustomerId: noahCustomerIdFromUserId(ownerUserId, "business"),
      subjectUserId: ownerUserId,
    },
  }
}
