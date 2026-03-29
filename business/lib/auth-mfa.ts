import type { SupabaseClient, User } from "@supabase/supabase-js"

/** True if the user can sign in with email + password (not Google-only). */
export function hasEmailPasswordIdentity(user: User | null): boolean {
  if (!user?.identities?.length) return false
  return user.identities.some((i) => i.provider === "email")
}

export type TotpFactorLike = {
  id: string
  status: string
  friendly_name?: string
}

/** `listFactors().totp` may omit unverified factors; use `all` filtered by type. */
export function totpFactorsFromListResponse(data: {
  all?: Array<{ factor_type: string; id: string; status: string; friendly_name?: string }>
} | null | undefined): TotpFactorLike[] {
  if (!data?.all?.length) return []
  return data.all
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({
      id: f.id,
      status: f.status,
      friendly_name: f.friendly_name,
    }))
}

/** First verified TOTP factor id, if any. */
export function getVerifiedTotpFactorId(
  totp: TotpFactorLike[] | undefined | null,
): string | null {
  if (!totp?.length) return null
  const v = totp.find((f) => f.status === "verified")
  return v?.id ?? null
}

/**
 * Drops TOTP factors stuck in `unverified` (abandoned enroll, duplicate friendly name on re-enroll).
 * Safe to call before `mfa.enroll`; does not remove verified factors.
 */
export async function unenrollUnverifiedTotpFactors(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.mfa.listFactors()
  if (error || !data?.all?.length) return
  for (const f of data.all) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await client.auth.mfa.unenroll({ factorId: f.id })
    }
  }
}

export function isDuplicateMfaFriendlyNameError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes("already exists") && m.includes("friendly")
}

/** After password sign-in, true when GoTrue requires MFA (TOTP) to reach AAL2. */
export function isMfaStepRequired(aal: {
  currentLevel: string | null
  nextLevel: string | null
} | null): boolean {
  if (!aal) return false
  return aal.currentLevel === "aal1" && aal.nextLevel === "aal2"
}
