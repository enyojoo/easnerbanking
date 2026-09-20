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
  /** GoTrue `key.URL()` when the API returns it – preferred for client-rendered QR. */
  keyUri: string | null
}

/** `listFactors().totp` may omit unverified factors; use `all` filtered by type. */
export function totpFactorsFromListResponse(data: {
  all?: Array<{ factor_type: string; id: string; status: string; friendly_name?: string }>
  totp?: Array<{ id: string; status: string; friendly_name?: string }>
} | null | undefined): TotpFactorLike[] {
  if (data?.all?.length) {
    return data.all
      .filter((f) => f.factor_type === "totp")
      .map((f) => ({
        id: f.id,
        status: f.status,
        friendly_name: f.friendly_name,
      }))
  }
  if (!data?.totp?.length) return []
  return data.totp.map((f) => ({
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

/** Factor already removed (e.g. duplicate cleanup after aborting MFA setup). */
export function isMfaFactorGoneError(
  error: { message?: string; status?: number } | null | undefined,
): boolean {
  if (!error) return false
  if (error.status === 404) return true
  const msg = String(error.message || "").toLowerCase()
  return msg.includes("not found") || msg.includes("404")
}

let unenrollUnverifiedTotpInFlight: Promise<void> | null = null
/** Factor id from the latest `beginTotpEnrollment` – background cleanup must not delete it. */
let activeUnverifiedTotpFactorId: string | null = null
/** True while enroll list/create is running (active id is not set yet). */
let totpEnrollInProgress = false

function clearActiveUnverifiedTotpEnrollment() {
  activeUnverifiedTotpFactorId = null
}

/**
 * Drops TOTP factors stuck in `unverified` (abandoned enroll, duplicate friendly name on re-enroll).
 * Safe to call before `mfa.enroll`; does not remove verified factors.
 * Concurrent calls share one in-flight request; 404 on delete is treated as success.
 * Skips the in-progress enroll factor unless `force` is set (user aborted setup).
 */
export async function unenrollUnverifiedTotpFactors(
  client: SupabaseClient,
  opts?: { force?: boolean },
): Promise<void> {
  const force = opts?.force === true
  if (!force && totpEnrollInProgress) return

  const previous = unenrollUnverifiedTotpInFlight
  const run = (async () => {
    if (previous) await previous
    if (!force && totpEnrollInProgress) return
    const { data, error } = await client.auth.mfa.listFactors()
    if (!force && totpEnrollInProgress) return
    if (error || !data?.all?.length) return
    for (const f of data.all) {
      if (f.factor_type !== "totp" || f.status !== "unverified") continue
      if (!force && totpEnrollInProgress) return
      if (!force && f.id === activeUnverifiedTotpFactorId) continue
      const { error: uErr } = await client.auth.mfa.unenroll({ factorId: f.id })
      if (uErr && !isMfaFactorGoneError(uErr)) {
        // Non-404 failures are rare; keep going so other stale factors can still be removed.
        continue
      }
    }
  })()

  unenrollUnverifiedTotpInFlight = run
  void run.finally(() => {
    if (unenrollUnverifiedTotpInFlight === run) {
      unenrollUnverifiedTotpInFlight = null
    }
  })

  return run
}

/** Drop abandoned unverified TOTP after the user leaves setup (including the factor they were scanning). */
export async function discardUnverifiedTotpEnrollment(client: SupabaseClient): Promise<void> {
  clearActiveUnverifiedTotpEnrollment()
  await unenrollUnverifiedTotpFactors(client, { force: true })
}

export function isDuplicateMfaFriendlyNameError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes("already exists") && m.includes("friendly")
}

/** Name shown in authenticator apps from the otpauth URI / factor metadata. */
export const MFA_TOTP_ISSUER = "Easner Banking"

/**
 * otpauth:// URI matching GoTrue TOTP enrollment (`issuer` + account email in the path label).
 */
export function totpKeyUriForEnroll(secret: string, email: string | null | undefined): string {
  const issuer = MFA_TOTP_ISSUER
  const account = email?.trim() || "user"
  const label = encodeURIComponent(`${issuer}:${account}`)
  const encIssuer = encodeURIComponent(issuer)
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encIssuer}`
}

export async function beginTotpEnrollment(client: SupabaseClient): Promise<TotpEnrollSetup> {
  totpEnrollInProgress = true
  clearActiveUnverifiedTotpEnrollment()
  try {
    await unenrollUnverifiedTotpFactors(client, { force: true })

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
      await unenrollUnverifiedTotpFactors(client, { force: true })
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

    const totpPayload = data.totp as {
      qr_code: string
      secret?: string
      uri?: string
    }
    const { qr_code, secret, uri: keyUriRaw } = totpPayload
    const qrDataUrl = qr_code.startsWith("data:")
      ? qr_code
      : `data:image/svg+xml;utf-8,${encodeURIComponent(qr_code)}`
    const keyUri =
      typeof keyUriRaw === "string" && keyUriRaw.startsWith("otpauth://") ? keyUriRaw.trim() : null

    activeUnverifiedTotpFactorId = data.id
    return {
      factorId: data.id,
      qrDataUrl,
      secret: secret ?? null,
      keyUri,
    }
  } finally {
    totpEnrollInProgress = false
  }
}

export type DisableTotpResult =
  | { ok: true }
  | { ok: false; message: string; invalidCode?: boolean }

/**
 * Always challenge + verify TOTP before `unenroll`, including AAL2 sessions.
 * An unlocked browser must not drop MFA without a fresh authenticator code.
 */
export async function disableVerifiedTotpWithCode(
  client: SupabaseClient,
  codeRaw: string,
): Promise<DisableTotpResult> {
  const code = codeRaw.replace(/\D/g, "")
  if (code.length !== 6) {
    return { ok: false, message: "Enter the 6-digit code from your authenticator app." }
  }
  const { data, error: listErr } = await client.auth.mfa.listFactors()
  if (listErr) {
    return { ok: false, message: listErr.message || "Could not load MFA factors." }
  }
  const id = getVerifiedTotpFactorId(totpFactorsFromListResponse(data))
  if (!id) {
    return { ok: false, message: "No verified authenticator found." }
  }
  const { data: ch, error: chErr } = await client.auth.mfa.challenge({ factorId: id })
  if (chErr || !ch?.id) {
    return { ok: false, message: chErr?.message || "Could not verify the code." }
  }
  const { error: vErr } = await client.auth.mfa.verify({
    factorId: id,
    challengeId: ch.id,
    code,
  })
  if (vErr) {
    const raw = String(vErr.message || "").toLowerCase()
    return {
      ok: false,
      message: vErr.message || "Invalid code.",
      invalidCode: raw.includes("invalid") || raw.includes("code"),
    }
  }
  const { error: uErr } = await client.auth.mfa.unenroll({ factorId: id })
  if (uErr) {
    return { ok: false, message: uErr.message || "Could not disable two-factor authentication." }
  }
  return { ok: true }
}

/**
 * `mfa.listFactors` can fail until the in-memory session is ready. Used by settings / More – pair
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
 * `AuthSessionRedirect` both consult this so we don't leave `/auth/login` before the MFA step
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
