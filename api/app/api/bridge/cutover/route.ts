import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "../_helpers"
import { ensureMobileBridgeCutover } from "@/lib/bridge/cutover"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const admin = createSupabaseAdmin()
  const result = await ensureMobileBridgeCutover(admin, auth.user.id)
  return NextResponse.json(result)
}
