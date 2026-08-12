/**
 * Existing-account messaging for signup (Business web / Mobile).
 * Used by `/api/auth/signup-precheck` and client fallbacks after `supabase.auth.signUp`.
 */

export type SignupAuthSurface = "business_web" | "consumer_mobile"

export type SignupExistingRole = "business" | "individual"

export type SignupExistingAccountBlock = {
  code: "EMAIL_REGISTERED_SAME_SURFACE" | "EMAIL_REGISTERED_OTHER_SURFACE"
  error: string
  otherSurface?: SignupAuthSurface
}

export const SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE =
  "An account with this email already exists. Please sign in instead."

const OTHER_SURFACE_BUSINESS =
  "This email is already registered for Easner Business. Sign in at business.easner.com, or use a different email."

const OTHER_SURFACE_MOBILE =
  "This email is already registered for Easner Mobile. Sign in through the Easner mobile app, or use a different email."

export function resolveSignupExistingAccountBlock(input: {
  surface: SignupAuthSurface
  existingRole: SignupExistingRole
}): SignupExistingAccountBlock {
  const onBusiness = input.existingRole === "business"
  const wantsBusiness = input.surface === "business_web"
  if (onBusiness === wantsBusiness) {
    return {
      code: "EMAIL_REGISTERED_SAME_SURFACE",
      error: SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE,
    }
  }
  return {
    code: "EMAIL_REGISTERED_OTHER_SURFACE",
    otherSurface: onBusiness ? "business_web" : "consumer_mobile",
    error: onBusiness ? OTHER_SURFACE_BUSINESS : OTHER_SURFACE_MOBILE,
  }
}

/** Supabase "Confirm email" anti-enumeration: existing users often return with empty identities. */
export function isSupabaseSignupDuplicateUser(user: {
  identities?: Array<unknown> | null
} | null | undefined): boolean {
  if (!user) return false
  const identities = user.identities
  return Array.isArray(identities) && identities.length === 0
}

const DUPLICATE_MESSAGE_RE =
  /already\s+(been\s+)?registered|already\s+exists|user\s+already|email\s+.*taken/i

/** Map raw Supabase signup errors to the same-surface sign-in CTA copy. */
export function mapSupabaseSignupDuplicateError(message: string | null | undefined): string | null {
  const msg = String(message || "").trim()
  if (!msg) return null
  if (!DUPLICATE_MESSAGE_RE.test(msg)) return null
  return SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE
}
