import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"

export async function requirePricingAuth(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user }
}
