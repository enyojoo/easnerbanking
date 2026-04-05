/**
 * Server-side loader for `system_settings.jurisdiction_country_policy`.
 * Pure parsing lives in `@easner/shared` (also used by Office and mobile).
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  effectiveAllowlistForSurface,
  parseJurisdictionCountryPolicyJson,
  type JurisdictionCountryPolicyV1,
  type JurisdictionSurface,
} from "@easner/shared"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

const SETTINGS_KEY = "jurisdiction_country_policy"

export type { JurisdictionSurface, JurisdictionCountryPolicyV1 }

export type JurisdictionPolicyResolved = {
  policy: JurisdictionCountryPolicyV1 | null
  policyVersion: number
  signupAllowlist: string[] | null
  kybAllowlist: string[] | null
}

export async function getJurisdictionPolicyResolved(admin: SupabaseAdmin): Promise<JurisdictionPolicyResolved> {
  const { data } = await admin.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle()

  const raw = data?.value != null ? String(data.value) : null
  const { policy } = parseJurisdictionCountryPolicyJson(raw)
  const policyVersion = policy?.v ?? 0

  return {
    policy,
    policyVersion,
    signupAllowlist: effectiveAllowlistForSurface(policy, "signup"),
    kybAllowlist: effectiveAllowlistForSurface(policy, "kyb"),
  }
}

export async function isCountryAllowedForSurface(
  admin: SupabaseAdmin,
  countryCode: string | null,
  surface: JurisdictionSurface,
): Promise<boolean> {
  if (!countryCode) return true
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return false
  const resolved = await getJurisdictionPolicyResolved(admin)
  const list = surface === "kyb" ? resolved.kybAllowlist : resolved.signupAllowlist
  if (list == null) return true
  return list.includes(code)
}
