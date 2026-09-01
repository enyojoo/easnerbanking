/** Review window before an unrestricted account auto-closes (locks). */
export const ACCOUNT_RESTRICTION_WIND_DOWN_MS = 7 * 24 * 60 * 60 * 1000

export const ACCOUNT_RESTRICTED_CODE = "ACCOUNT_RESTRICTED" as const
export const ACCOUNT_LOCKED_CODE = "ACCOUNT_LOCKED" as const

export type AccountRestrictionPhase = "none" | "wind_down" | "locked"
export type AccountRestrictionSubjectKind = "user" | "business"
export type AccountRestrictionSource = "grid" | "noah" | "office"

export type ResolvedAccountRestriction = {
  active: boolean
  phase: AccountRestrictionPhase
  subjectKind: AccountRestrictionSubjectKind | null
  restrictedAt: string | null
  windDownEndsAt: string | null
  lockedAt: string | null
  reason: string | null
  source: AccountRestrictionSource | null
}

export function emptyAccountRestriction(): ResolvedAccountRestriction {
  return {
    active: false,
    phase: "none",
    subjectKind: null,
    restrictedAt: null,
    windDownEndsAt: null,
    lockedAt: null,
    reason: null,
    source: null,
  }
}

export function computeAccountRestrictionPhase(input: {
  restrictedAt: string
  windDownEndsAt: string
  lockedAt?: string | null
  now?: number
}): AccountRestrictionPhase {
  const now = input.now ?? Date.now()
  const ends = Date.parse(input.windDownEndsAt)
  if (input.lockedAt) return "locked"
  if (Number.isFinite(ends) && now >= ends) return "locked"
  return "wind_down"
}

export function formatAccountRestrictionDeadline(iso: string | null | undefined, locale = "en-US"): string {
  if (!iso) return ""
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ""
  return new Date(ms).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function accountRestrictionWindDownBannerCopy(windDownEndsAt: string | null | undefined): string {
  const deadline = formatAccountRestrictionDeadline(windDownEndsAt)
  if (!deadline) {
    return "Your account is under compliance review. Deposits and transfers are paused. Contact Easner support."
  }
  return `Your account is under compliance review. Deposits and transfers are paused. Contact Easner support by ${deadline} or your account may be closed.`
}

export function accountRestrictionSendBlockedCopy(): string {
  return "Transfers are not available while your account is restricted. Contact Easner support if you have questions."
}

export function accountRestrictionLockedCopy(): string {
  return "Your account has been suspended. Contact support if you have questions."
}

export function accountRestrictionDepositsBlockedCopy(): string {
  return "Deposits are not available while your account is restricted."
}

export function accountRestrictionVerificationBlockedCopy(): string {
  return "Verification actions are unavailable while your account is restricted. Contact Easner support if you have questions."
}
