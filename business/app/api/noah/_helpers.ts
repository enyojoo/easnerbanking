import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "@/lib/noah/customer-id"
import { isNoahConfigured, isNoahSigningConfigured } from "@/lib/noah/config"
import {
  readAccountScopeFromRequest,
  readNoahScopeFromRequest,
  resolveNoahContextAsync,
} from "@/lib/noah/resolve-noah-context"

export type { NoahCustomerScope }

export { readAccountScopeFromRequest, readNoahScopeFromRequest, resolveNoahContextAsync }

export async function requireAuth(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user }
}

export function requireNoahEnv() {
  if (!isNoahConfigured()) {
    return NextResponse.json(
      {
        error:
          "Easner payments are not available in this environment. If you administer this deployment, configure the payment provider credentials.",
      },
      { status: 503 }
    )
  }
  if (!isNoahSigningConfigured()) {
    return NextResponse.json(
      {
        error:
          "Noah production signing is not configured. Set NOAH_SIGNING_PRIVATE_KEY on the business API deployment.",
      },
      { status: 503 }
    )
  }
  return null
}
