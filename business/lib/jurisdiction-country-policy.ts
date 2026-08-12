/**
 * Server-side loader for `system_settings.jurisdiction_country_policy`.
 * Pure parsing lives in `@easner/shared` (also used by Office and mobile).
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  effectiveAllowlistForSurface,
  isBlockedForBusiness,
  parseJurisdictionCountryPolicyJson,
  resolveJurisdictionAllowlist,
  type JurisdictionCountryPolicyV1,
  type JurisdictionSurface,
} from "@easner/shared"
import { countries } from "@/lib/countries"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

const SETTINGS_KEY = "jurisdiction_country_policy"

export type { JurisdictionSurface, JurisdictionCountryPolicyV1 }

export type JurisdictionPolicyResolved = {
  policy: JurisdictionCountryPolicyV1 | null
  policyVersion: number
  /** True when Office has no signup allowlist configured (catalog − hard-blocks). */
  signupUnrestricted: boolean
  /** True when Office has no KYB allowlist configured. */
  kybUnrestricted: boolean
  signupAllowlist: string[]
  kybAllowlist: string[]
}

export async function getJurisdictionPolicyResolved(admin: SupabaseAdmin): Promise<JurisdictionPolicyResolved> {
  const { data } = await admin.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle()

  const raw = data?.value != null ? String(data.value) : null
  const { policy } = parseJurisdictionCountryPolicyJson(raw)
  const policyVersion = policy?.v ?? 0

  const catalogCodes = countries.map((c) => c.code)
  const signupRaw = effectiveAllowlistForSurface(policy, "signup")
  const kybRaw = effectiveAllowlistForSurface(policy, "kyb")

  return {
    policy,
    policyVersion,
    signupUnrestricted: signupRaw == null,
    kybUnrestricted: kybRaw == null,
    signupAllowlist: resolveJurisdictionAllowlist(signupRaw, catalogCodes),
    kybAllowlist: resolveJurisdictionAllowlist(kybRaw, catalogCodes),
  }
}

export async function isCountryAllowedForSurface(
  admin: SupabaseAdmin,
  countryCode: string | null,
  surface: JurisdictionSurface,
): Promise<boolean> {
  if (!countryCode) return surface === "individual_residence" ? false : true
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return false
  // Business product: Grid main prohibited only (never Noah geography / digital-asset extras).
  if (isBlockedForBusiness(code)) return false
  const resolved = await getJurisdictionPolicyResolved(admin)
  const list =
    surface === "kyb"
      ? resolved.kybAllowlist
      : surface === "individual_residence"
        ? resolved.signupAllowlist
        : resolved.signupAllowlist
  return list.includes(code)
}
