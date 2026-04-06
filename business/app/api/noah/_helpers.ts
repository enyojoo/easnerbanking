import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "@/lib/noah/customer-id"
import { isNoahConfigured } from "@/lib/noah/config"
import {
  readNoahScopeFromRequest,
  resolveNoahContextAsync,
} from "@/lib/noah/resolve-noah-context"

export type { NoahCustomerScope }

export { readNoahScopeFromRequest, resolveNoahContextAsync }

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
  return null
}
