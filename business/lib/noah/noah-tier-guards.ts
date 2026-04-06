import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "./customer-id"

/**
 * Block deposit/balance account APIs until Noah KYC (individual) or KYB (business) is approved.
 * B2B reads `businesses.noah_kyb_status`; consumer reads `users.noah_kyc_status`.
 */
export async function requireNoahVerificationApproved(
  subjectUserId: string,
  scope: NoahCustomerScope,
  subjectBusinessId?: string | null,
): Promise<NextResponse | null> {
  const admin = createSupabaseAdmin()

  if (scope === "business") {
    if (!subjectBusinessId) {
      return NextResponse.json({ error: "Business context missing" }, { status: 400 })
    }
    const { data: biz, error } = await admin
      .from("businesses")
      .select("noah_kyb_status")
      .eq("id", subjectBusinessId)
      .maybeSingle()

    if (error || !biz) {
      return NextResponse.json({ error: "Business not found" }, { status: 400 })
    }

    if (biz.noah_kyb_status !== "approved") {
      return NextResponse.json(
        { error: "Business verification must be approved before using accounts.", code: "NOAH_KYB_REQUIRED" },
        { status: 403 },
      )
    }
    return null
  }

  const { data: row, error } = await admin
    .from("users")
    .select("noah_kyc_status")
    .eq("id", subjectUserId)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 })
  }

  if (row.noah_kyc_status !== "approved") {
    return NextResponse.json(
      { error: "Identity verification must be approved before using accounts.", code: "NOAH_KYC_REQUIRED" },
      { status: 403 },
    )
  }

  return null
}
