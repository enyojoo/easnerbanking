import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "@/lib/noah/customer-id"
import { isNoahConfigured } from "@/lib/noah/config"
import { resolveNoahContext as resolveNoahContextImpl } from "@/lib/noah/resolve-noah-context"

export type { NoahCustomerScope }

export const resolveNoahContext = resolveNoahContextImpl

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
      { error: "Noah is not configured (set NOAH_API_KEY and optionally NOAH_SIGNING_PRIVATE_KEY)" },
      { status: 503 }
    )
  }
  return null
}
