import { NextResponse } from "next/server"
import { countries, displayCountryFromBusinessSetting } from "@/lib/countries"
import { canResubmitVerification } from "@easner/shared"
import { isCountryAllowedForSurface } from "@/lib/jurisdiction-country-policy"
import { isVerificationApproved } from "@/lib/compliance"
import type { createSupabaseAdmin } from "@/lib/supabase/admin"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export type GridKycLinksPreflightResult =
  | { action: "proceed" }
  | { action: "respond"; response: NextResponse }
  | { action: "skipHostedPost"; kycStatus: string }

function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const found = countries.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
  return found?.code ?? null
}

export async function evaluateGridBusinessKycLinksPreflight(params: {
  admin: SupabaseAdmin
  businessId: string
}): Promise<GridKycLinksPreflightResult> {
  const { admin, businessId } = params

  const { data: biz } = await admin
    .from("businesses")
    .select("verification_status,verification_rejection_reasons,country")
    .eq("id", businessId)
    .maybeSingle()

  const rejectionReasons =
    (biz?.verification_rejection_reasons as unknown[] | null | undefined) ?? null
  if (!canResubmitVerification(rejectionReasons)) {
    return {
      action: "respond",
      response: NextResponse.json({
        canResubmit: false,
        kyc_link: null,
        kyc_status: "rejected",
        alreadyOnboarded: true,
      }),
    }
  }

  const countryDisplay = displayCountryFromBusinessSetting(biz?.country as string | null | undefined)
  const registrationCode = countryCodeFromName(countryDisplay || (biz?.country as string | undefined))
  if (registrationCode) {
    const allowed = isCountryAllowedForSurface(registrationCode, "signup")
    if (!allowed) {
      return {
        action: "respond",
        response: NextResponse.json(
          {
            error:
              "Business verification is not available for your country of registration. Contact support if you need help.",
            code: "COUNTRY_NOT_SUPPORTED",
          },
          { status: 403 },
        ),
      }
    }
  }

  const status = String(biz?.verification_status ?? "not_started").toLowerCase()
  if (isVerificationApproved(status)) {
    return { action: "skipHostedPost", kycStatus: status }
  }

  return { action: "proceed" }
}
