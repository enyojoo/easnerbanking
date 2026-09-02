/** Review window before an unrestricted account auto-closes (locks). */
export const ACCOUNT_RESTRICTION_WIND_DOWN_MS = 7 * 24 * 60 * 60 * 1000

export const ACCOUNT_RESTRICTED_CODE = "ACCOUNT_RESTRICTED" as const
export const ACCOUNT_LOCKED_CODE = "ACCOUNT_LOCKED" as const
export const ACCOUNT_RESTRICTION_STATUS_LABEL = "Restricted" as const

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

/** Map an `account_restrictions` row (realtime or DB) into UI state. Lifted rows → inactive. */
export function resolvedAccountRestrictionFromRow(
  row: {
    subject_kind?: string | null
    restricted_at?: string | null
    wind_down_ends_at?: string | null
    locked_at?: string | null
    lifted_at?: string | null
    reason?: string | null
    source?: string | null
  } | null | undefined,
  now = Date.now(),
): ResolvedAccountRestriction {
  if (!row?.restricted_at || !row.wind_down_ends_at) return emptyAccountRestriction()
  if (row.lifted_at) return emptyAccountRestriction()

  const subjectKind =
    row.subject_kind === "business" || row.subject_kind === "user" ? row.subject_kind : null
  const source =
    row.source === "grid" || row.source === "noah" || row.source === "office" ? row.source : null
  const phase = computeAccountRestrictionPhase({
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
    now,
  })

  return {
    active: true,
    phase,
    subjectKind,
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at ?? null,
    reason: row.reason ?? null,
    source,
  }
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

export const ACCOUNT_RESTRICTION_WIND_DOWN_BANNER =
  "Your account is under compliance review. Deposits and transfers are paused."

export const ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA = "Contact Us"

export function accountRestrictionWindDownBannerCopy(windDownEndsAt?: string | null): string {
  const deadline = formatAccountRestrictionDeadline(windDownEndsAt)
  if (!deadline) return ACCOUNT_RESTRICTION_WIND_DOWN_BANNER
  return `${ACCOUNT_RESTRICTION_WIND_DOWN_BANNER} Contact Easner support by ${deadline} or your account may be closed.`
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

/** Partner holds (Grid, Noah) cannot be cleared from Office; only office-applied holds can be lifted. */
export function accountRestrictionOfficeCanLift(source: AccountRestrictionSource | null | undefined): boolean {
  return source === "office"
}

export function accountRestrictionOfficeLiftBlockedCopy(source?: AccountRestrictionSource | null): string {
  if (source === "noah") {
    return "This restriction was applied by Noah and cannot be lifted from Office. Resolve the hold with Noah first."
  }
  if (source === "grid") {
    return "This restriction was applied by Grid compliance and cannot be lifted from Office. Resolve the hold in Grid first."
  }
  return "This restriction cannot be lifted from Office."
}
