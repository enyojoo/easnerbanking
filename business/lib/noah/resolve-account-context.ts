import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId, type NoahCustomerScope } from "./customer-id"
import { readNoahScopeFromRequest } from "./resolve-noah-context"

export type NoahAccountContext = {
  scope: NoahCustomerScope
  customerType: "Individual" | "Business"
  noahCustomerId: string
  /** Org id for B2B Noah customer; null for individual. */
  subjectBusinessId: string | null
  /** Easner user authorized as org owner (B2B) or the consumer (individual). */
  subjectUserId: string
}

/**
 * For **business** scope: only the organization owner may call; Noah `CustomerID` is `ebiz_{businesses.id}`.
 * For **individual**: subject is the session user.
 */
export async function resolveNoahAccountContext(
  request: Request,
  sessionUserId: string,
  bodyTypeHint?: string,
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
      noahCustomerId: noahCustomerIdFromBusinessId(orgId),
      subjectBusinessId: orgId,
      subjectUserId: ownerUserId,
    },
  }
}
