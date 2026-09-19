import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { isBridgeConfigured } from "@/lib/bridge/config"

export async function requireAuth(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user }
}

export function requireBridgeEnv() {
  if (!isBridgeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Verification is not available in this environment. Configure Bridge credentials on the business API deployment.",
      },
      { status: 503 },
    )
  }
  return null
}
