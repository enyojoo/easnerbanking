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

export type TotpEnrollSetup = {
  factorId: string
  qrDataUrl: string
  secret: string | null
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

/** Name shown in authenticator apps from the otpauth URI / factor metadata. */
export const MFA_TOTP_ISSUER = "Easner Banking"

export async function beginTotpEnrollment(client: SupabaseClient): Promise<TotpEnrollSetup> {
  await unenrollUnverifiedTotpFactors(client)

  const {
    data: { session },
  } = await client.auth.getSession()
  const email = session?.user?.email?.trim() ?? null
  const enrollParams = {
    factorType: "totp" as const,
    issuer: MFA_TOTP_ISSUER,
    friendlyName: email ? `${MFA_TOTP_ISSUER} (${email})` : MFA_TOTP_ISSUER,
  }

  let { data, error: enErr } = await client.auth.mfa.enroll(enrollParams)
  if (enErr && isDuplicateMfaFriendlyNameError(enErr.message)) {
    await unenrollUnverifiedTotpFactors(client)
    const second = await client.auth.mfa.enroll(enrollParams)
    data = second.data
    enErr = second.error
  }

  if (enErr || !data) {
    throw new Error(enErr?.message || "Could not start enrollment. Is TOTP enabled in your project?")
  }
  if (data.type !== "totp" || !data.totp) {
    throw new Error("Unexpected response from the server.")
  }

  const { qr_code, secret } = data.totp
  const qrDataUrl = qr_code.startsWith("data:")
    ? qr_code
    : `data:image/svg+xml;utf-8,${encodeURIComponent(qr_code)}`

  return {
    factorId: data.id,
    qrDataUrl,
    secret: secret ?? null,
  }
}

/**
 * `mfa.listFactors` can fail until the in-memory session is ready. Used by settings / More — pair
 * with UI that does not cache "Unable to load" snapshots.
 */
export async function listFactorsForMfaStatus(client: SupabaseClient) {
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData?.session) {
    await client.auth.refreshSession()
  }

  const attempts = 4
  let lastError: { message: string } | null = null
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await client.auth.mfa.listFactors()
    if (!error) return { data, error: null as null }
    lastError = error
    if (i < attempts - 1) {
      await client.auth.refreshSession()
      await new Promise((r) => setTimeout(r, 80 * (i + 1)))
    }
  }
  return { data: null, error: lastError }
}

/** After password sign-in, true when GoTrue requires MFA (TOTP) to reach AAL2. */
export function isMfaStepRequired(aal: {
  currentLevel: string | null
  nextLevel: string | null
} | null): boolean {
  if (!aal) return false
  return aal.currentLevel === "aal1" && aal.nextLevel === "aal2"
}

const POST_SIGN_IN_AAL_ATTEMPTS = 12
const POST_SIGN_IN_AAL_DELAY_MS = 50

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * After `signInWithPassword`, AAL can briefly be missing or inconsistent. The login form and
 * `AuthSessionRedirect` both consult this so we don't `replace("/dashboard")` before the MFA step
 * is detected (which felt like "nothing happens until I submit again").
 */
export async function resolvePostSignInMfaRequirement(
  client: SupabaseClient,
): Promise<{ needsOtp: boolean; error: Error | null }> {
  for (let i = 0; i < POST_SIGN_IN_AAL_ATTEMPTS; i++) {
    const { data: aal, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      return { needsOtp: false, error: new Error(error.message) }
    }
    if (isMfaStepRequired(aal)) {
      return { needsOtp: true, error: null }
    }
    if (aal?.currentLevel === "aal2") {
      return { needsOtp: false, error: null }
    }
    await delay(POST_SIGN_IN_AAL_DELAY_MS)
  }

  const { data: aal, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) {
    return { needsOtp: false, error: new Error(error.message) }
  }
  if (isMfaStepRequired(aal)) {
    return { needsOtp: true, error: null }
  }
  if (aal?.currentLevel === "aal1") {
    const { data: factors, error: fErr } = await client.auth.mfa.listFactors()
    if (!fErr && factors && getVerifiedTotpFactorId(totpFactorsFromListResponse(factors))) {
      return { needsOtp: true, error: null }
    }
  }
  return { needsOtp: false, error: null }
}
