import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getInvitePreviewByMembershipId } from "@/lib/business/claim-team-invite"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const membershipId = url.searchParams.get("membership")?.trim() ?? ""

  if (!membershipId) {
    return NextResponse.json({ error: "membership is required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const preview = await getInvitePreviewByMembershipId(admin, membershipId)

  if (!preview.ok) {
    return NextResponse.json({ error: preview.message, code: preview.code }, { status: 404 })
  }

  return NextResponse.json({
    businessName: preview.businessName,
    role: preview.role,
    status: preview.status,
  })
}
