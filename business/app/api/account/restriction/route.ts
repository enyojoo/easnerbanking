import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { resolveAccountRestrictionForUserId } from "@/lib/account-restriction"
import { emptyAccountRestriction } from "@easner/shared"

export const runtime = "nodejs"

/** Current account restriction for the authenticated user (200 even when locked). */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const restriction = await resolveAccountRestrictionForUserId(admin, user.id)
  return NextResponse.json({
    restriction: restriction.active ? restriction : emptyAccountRestriction(),
  })
}
