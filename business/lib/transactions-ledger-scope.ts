import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export type LedgerListScope = "business" | "individual"

/**
 * Resolves which Supabase ledger slice `/api/transactions` should read.
 * - Explicit `X-Easner-Noah-Scope: business` → org rows (requires easner_business_id).
 * - Explicit `X-Easner-Noah-Scope: individual` → personal Noah rows (user_id, business_id null).
 * - Header absent → business if user has easner_business_id, else individual (business web default).
 */
export async function resolveLedgerListScope(
  request: Request,
  sessionUserId: string,
): Promise<
  | { ok: true; scope: LedgerListScope; businessId: string | null }
  | { ok: false; response: NextResponse }
> {
  const headerScope = request.headers.get("x-easner-noah-scope")?.toLowerCase()
  const admin = createSupabaseAdmin()
  const { data: userRow, error } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", sessionUserId)
    .maybeSingle()
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) }
  }
  const businessId = (userRow?.easner_business_id as string | null | undefined) ?? null

  if (headerScope === "business") {
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
    return { ok: true, scope: "business", businessId }
  }
  if (headerScope === "individual") {
    return { ok: true, scope: "individual", businessId }
  }

  if (businessId) {
    return { ok: true, scope: "business", businessId }
  }
  return { ok: true, scope: "individual", businessId: null }
}
