import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/supabase/admin"
import { noahCustomerIdFromUserId, type NoahCustomerScope } from "@/lib/noah/customer-id"
import { isNoahConfigured } from "@/lib/noah/config"

export type { NoahCustomerScope }

/**
 * Resolve Noah customer id + API `CustomerType` for this request.
 * - Default: **individual** (mobile KYC) — `easner_{userId}`.
 * - **business** (KYB): header `X-Easner-Noah-Scope: business`, query `?noahScope=business`, or JSON `type: "business"`.
 */
export function resolveNoahContext(
  userId: string,
  request: Request,
  bodyTypeHint?: string
): {
  scope: NoahCustomerScope
  customerType: "Individual" | "Business"
  noahCustomerId: string
} {
  const headers = request.headers
  const url = new URL(request.url)
  const headerScope = headers.get("x-easner-noah-scope")?.toLowerCase()
  const queryScope = url.searchParams.get("noahScope")?.toLowerCase()
  const hint = bodyTypeHint?.toLowerCase()

  let scope: NoahCustomerScope = "individual"
  if (
    headerScope === "business" ||
    queryScope === "business" ||
    hint === "business"
  ) {
    scope = "business"
  }

  const customerType = scope === "business" ? "Business" : "Individual"
  const noahCustomerId = noahCustomerIdFromUserId(userId, scope)
  return { scope, customerType, noahCustomerId }
}

export async function requireAuth(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user }
}

export function requireNoahEnv() {
  if (!isNoahConfigured()) {
    return NextResponse.json(
      { error: "Noah is not configured (set NOAH_API_KEY and optionally NOAH_SIGNING_PRIVATE_KEY)" },
      { status: 503 }
    )
  }
  return null
}
