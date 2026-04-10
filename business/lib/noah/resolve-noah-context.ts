import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
  type NoahCustomerScope,
} from "./customer-id"

/**
 * Read requested Noah scope from header/query/body hint (no DB).
 * - **business**: header `X-Easner-Noah-Scope: business`, query `?noahScope=business`, or JSON `type: "business"`.
 */
export function readNoahScopeFromRequest(request: Request, bodyTypeHint?: string): NoahCustomerScope {
  const headers = request.headers
  const url = new URL(request.url)
  const headerScope = headers.get("x-easner-noah-scope")?.toLowerCase()
  const queryScope = url.searchParams.get("noahScope")?.toLowerCase()
  const hint = bodyTypeHint?.toLowerCase()

  if (headerScope === "business" || queryScope === "business" || hint === "business") {
    return "business"
  }
  return "individual"
}

/**
 * Resolve Noah customer id for this session (org-based `ebiz_*` when scope is business).
 * Business scope requires `users.easner_business_id`.
 */
export async function resolveNoahContextAsync(
  sessionUserId: string,
  request: Request,
  bodyTypeHint?: string,
): Promise<
  | {
      ok: true
      scope: NoahCustomerScope
      customerType: "Individual" | "Business"
      noahCustomerId: string
      businessId: string | null
    }
  | { ok: false; response: NextResponse }
> {
  const scope = readNoahScopeFromRequest(request, bodyTypeHint)
  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id, noah_customer_id")
    .eq("id", sessionUserId)
    .maybeSingle()

  const businessId = (userRow?.easner_business_id as string | null | undefined) ?? null
  const userStoredNoahId =
    (userRow?.noah_customer_id as string | null | undefined)?.trim() || null

  if (scope === "business") {
    if (!businessId) {
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
    const { data: businessRow } = await admin
      .from("businesses")
      .select("noah_customer_id")
      .eq("id", businessId)
      .maybeSingle()
    const businessStoredNoahId =
      (businessRow?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      ok: true,
      scope: "business",
      customerType: "Business",
      noahCustomerId: businessStoredNoahId || noahCustomerIdFromBusinessId(businessId),
      businessId,
    }
  }

  return {
    ok: true,
    scope: "individual",
    customerType: "Individual",
    noahCustomerId: userStoredNoahId || noahCustomerIdFromUserId(sessionUserId),
    businessId: null,
  }
}
