import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "./customer-id"

/**
 * Block deposit/balance account APIs until Noah KYC (individual) or KYB (business) is approved on `subjectUserId`.
 */
export async function requireNoahVerificationApproved(
  subjectUserId: string,
  scope: NoahCustomerScope,
): Promise<NextResponse | null> {
  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("users")
    .select("noah_kyc_status,noah_kyb_status")
    .eq("id", subjectUserId)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 })
  }

  if (scope === "business") {
    if (row.noah_kyb_status !== "approved") {
      return NextResponse.json(
        { error: "Business verification must be approved before using accounts.", code: "NOAH_KYB_REQUIRED" },
        { status: 403 },
      )
    }
    return null
  }

  if (row.noah_kyc_status !== "approved") {
    return NextResponse.json(
      { error: "Identity verification must be approved before using accounts.", code: "NOAH_KYC_REQUIRED" },
      { status: 403 },
    )
  }

  return null
}
