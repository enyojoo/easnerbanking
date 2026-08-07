import { emailDomain, isDisposableEmail } from "./disposable-email"

/** Apple Hide My Email relay domain (per-app opaque forwarding address). */
export const APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com"

export type SignupEmailBlockCode = "DISPOSABLE_EMAIL" | "APPLE_PRIVATE_RELAY_EMAIL"

export type SignupEmailBlockReason = {
  code: SignupEmailBlockCode
  error: string
}

export const SIGNUP_EMAIL_BLOCK_MESSAGES: Readonly<Record<SignupEmailBlockCode, string>> = {
  DISPOSABLE_EMAIL:
    "Please use a permanent email address. Temporary or disposable email providers aren't allowed.",
  APPLE_PRIVATE_RELAY_EMAIL:
    "Easner needs your real email address to open an account. When signing in with Apple, choose Share My Email — or create an account with your email address instead.",
}

/** True when the email is an Apple Hide My Email relay address. */
export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return emailDomain(email) === APPLE_PRIVATE_RELAY_DOMAIN
}

/** Parse Apple's `is_private_email` claim (boolean or `"true"` / `"false"` string). */
export function parseAppleIsPrivateEmailClaim(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value == null) return false
  if (typeof value === "string") return value.trim().toLowerCase() === "true"
  return Boolean(value)
}

export function isApplePrivateRelayFromIdentity(
  identityData: Record<string, unknown> | null | undefined,
): boolean {
  if (!identityData) return false
  if (parseAppleIsPrivateEmailClaim(identityData.is_private_email)) return true
  const email = typeof identityData.email === "string" ? identityData.email : null
  return isApplePrivateRelayEmail(email)
}

export type ResolveSignupEmailBlockOptions = {
  /** When true, treat as Apple relay even if the domain alone is inconclusive. */
  applePrivateRelay?: boolean
}

/**
 * Returns a block reason when an email must not be used for new sign-ups, or `null` when allowed.
 */
export function resolveSignupEmailBlock(
  email: string | null | undefined,
  options?: ResolveSignupEmailBlockOptions,
): SignupEmailBlockReason | null {
  if (isDisposableEmail(email)) {
    return {
      code: "DISPOSABLE_EMAIL",
      error: SIGNUP_EMAIL_BLOCK_MESSAGES.DISPOSABLE_EMAIL,
    }
  }
  if (options?.applePrivateRelay || isApplePrivateRelayEmail(email)) {
    return {
      code: "APPLE_PRIVATE_RELAY_EMAIL",
      error: SIGNUP_EMAIL_BLOCK_MESSAGES.APPLE_PRIVATE_RELAY_EMAIL,
    }
  }
  return null
}

export function signupEmailBlockMessageForCode(code: string | null | undefined): string | null {
  if (code === "DISPOSABLE_EMAIL") return SIGNUP_EMAIL_BLOCK_MESSAGES.DISPOSABLE_EMAIL
  if (code === "APPLE_PRIVATE_RELAY_EMAIL") return SIGNUP_EMAIL_BLOCK_MESSAGES.APPLE_PRIVATE_RELAY_EMAIL
  return null
}

function base64UrlDecodeToUtf8(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8")
  }
  if (typeof atob !== "undefined") {
    return atob(padded)
  }
  throw new Error("No base64 decoder available")
}

/** Decode a JWT payload without verifying the signature (pre-auth UX checks only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length < 2 || !parts[1]) return null
  try {
    return JSON.parse(base64UrlDecodeToUtf8(parts[1])) as Record<string, unknown>
  } catch {
    return null
  }
}

/** True when an Apple `id_token` indicates Hide My Email was used. */
export function applePrivateRelayFromIdToken(idToken: string): boolean {
  const claims = decodeJwtPayload(idToken)
  if (!claims) return false
  if (parseAppleIsPrivateEmailClaim(claims.is_private_email)) return true
  const email = typeof claims.email === "string" ? claims.email : null
  return isApplePrivateRelayEmail(email)
}

export function parseSignupEmailBlockFromJson(body: unknown): SignupEmailBlockReason | null {
  if (!body || typeof body !== "object") return null
  const rec = body as Record<string, unknown>
  const code = typeof rec.code === "string" ? rec.code : null
  if (code !== "DISPOSABLE_EMAIL" && code !== "APPLE_PRIVATE_RELAY_EMAIL") return null
  const known = signupEmailBlockMessageForCode(code)
  const error =
    known ||
    (typeof rec.error === "string" && rec.error.trim() ? rec.error.trim() : SIGNUP_EMAIL_BLOCK_MESSAGES.DISPOSABLE_EMAIL)
  return { code, error }
}

/** Parse a bootstrap / API error body (JSON string or object). */
export function parseSignupEmailBlockFromResponseText(text: string | null | undefined): SignupEmailBlockReason | null {
  if (!text?.trim()) return null
  try {
    return parseSignupEmailBlockFromJson(JSON.parse(text))
  } catch {
    return null
  }
}
