import { NextResponse } from "next/server"
import { countries, displayCountryFromBusinessSetting } from "@/lib/countries"
import { canResubmitNoahVerification } from "@easner/shared"
import { isCountryAllowedForSurface } from "@/lib/jurisdiction-country-policy"
import type { createSupabaseAdmin } from "@/lib/supabase/admin"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export type KycLinksPreflightResult =
  | { action: "proceed" }
  | { action: "respond"; response: NextResponse }
  | { action: "skipHostedPost"; kycStatus: string }

function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const found = countries.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
  return found?.code ?? null
}

function normalizeIso2(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/** Only skip a new hosted onboarding POST when verification is fully approved. */
function shouldSkipNewHostedSession(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase()
  return s === "approved"
}

export async function evaluateKycLinksPreflight(params: {
  admin: SupabaseAdmin
  scope: "business" | "individual"
  userId: string
  businessId: string | null
  residenceCountryFromBody?: string | null
}): Promise<KycLinksPreflightResult> {
  const { admin, scope, userId, businessId, residenceCountryFromBody } = params

  if (scope === "business" && businessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("noah_kyb_status,noah_kyb_rejection_reasons,country")
      .eq("id", businessId)
      .maybeSingle()

    const rejectionReasons = (biz?.noah_kyb_rejection_reasons as unknown[] | null | undefined) ?? null
    if (!canResubmitNoahVerification(rejectionReasons)) {
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
      const allowed = await isCountryAllowedForSurface(admin, registrationCode, "signup")
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

    if (shouldSkipNewHostedSession(biz?.noah_kyb_status as string | null | undefined)) {
      return {
        action: "skipHostedPost",
        kycStatus: String(biz?.noah_kyb_status ?? "pending").toLowerCase(),
      }
    }

    return { action: "proceed" }
  }

  let { data: userRow, error } = await admin
    .from("users")
    .select("noah_kyc_status,noah_kyc_rejection_reasons,residence_country")
    .eq("id", userId)
    .maybeSingle()
  if (error?.code === "42703" || error?.message?.includes("residence_country")) {
    const r2 = await admin
      .from("users")
      .select("noah_kyc_status,noah_kyc_rejection_reasons")
      .eq("id", userId)
      .maybeSingle()
    userRow = r2.data
  }

  const rejectionReasons = (userRow?.noah_kyc_rejection_reasons as unknown[] | null | undefined) ?? null
  if (!canResubmitNoahVerification(rejectionReasons)) {
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

  let residenceCode =
    normalizeIso2(userRow?.residence_country) ?? normalizeIso2(residenceCountryFromBody)

  if (!normalizeIso2(userRow?.residence_country) && normalizeIso2(residenceCountryFromBody)) {
    residenceCode = normalizeIso2(residenceCountryFromBody)
    try {
      await admin
        .from("users")
        .update({ residence_country: residenceCode, updated_at: new Date().toISOString() })
        .eq("id", userId)
    } catch {
      /* column may not exist yet */
    }
  }

  if (!residenceCode) {
    return {
      action: "respond",
      response: NextResponse.json(
        {
          error: "Please add your country of residence to continue verification.",
          code: "RESIDENCE_COUNTRY_REQUIRED",
          needsResidenceCountry: true,
        },
        { status: 400 },
      ),
    }
  }

  const allowed = await isCountryAllowedForSurface(admin, residenceCode, "individual_residence")
  if (!allowed) {
    return {
      action: "respond",
      response: NextResponse.json(
        {
          error: "Verification is not available for your country of residence. Contact support if you need help.",
          code: "COUNTRY_NOT_SUPPORTED",
        },
        { status: 403 },
      ),
    }
  }

  if (shouldSkipNewHostedSession(userRow?.noah_kyc_status as string | null | undefined)) {
    return {
      action: "skipHostedPost",
      kycStatus: String(userRow?.noah_kyc_status ?? "pending").toLowerCase(),
    }
  }

  return { action: "proceed" }
}
