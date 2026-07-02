import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getJurisdictionPolicyResolved, type JurisdictionSurface } from "@/lib/jurisdiction-country-policy"

/**
 * Public: ISO2 allowlists for signup / KYB country pickers. No PII.
 * Catalog names stay client-side; this returns only policy + codes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const surfaceRaw = url.searchParams.get("surface")
  const surface: JurisdictionSurface =
    surfaceRaw === "kyb"
      ? "kyb"
      : surfaceRaw === "individual_residence"
        ? "individual_residence"
        : "signup"

  const admin = createSupabaseAdmin()
  const resolved = await getJurisdictionPolicyResolved(admin)
  const codes =
    surface === "kyb"
      ? resolved.kybAllowlist
      : surface === "individual_residence"
        ? resolved.signupAllowlist
        : resolved.signupAllowlist

  return NextResponse.json({
    surface,
    policyVersion: resolved.policyVersion,
    unrestricted: false,
    codes,
  })
}
