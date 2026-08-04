/**
 * Customer-facing KYC/KYB verification status labels.
 * Internal/API status remains `approved`; UI uses "Verified".
 */
export const VERIFICATION_STATUS_COPY = {
  verified: "Verified",
  inReview: "In review",
  actionNeeded: "Action needed",
  unverified: "Unverified",
  notStarted: "Not started",
} as const

export type VerificationStatusLabelOpts = {
  /** Tier complete or explicit success — always "Verified". */
  complete?: boolean
  /** Detail screens: missing / not_started → "Not started" instead of "Unverified". */
  detail?: boolean
}

export function verificationStatusLabel(
  status: string | null | undefined,
  opts?: VerificationStatusLabelOpts,
): string {
  if (opts?.complete) {
    return VERIFICATION_STATUS_COPY.verified
  }

  const s = (status ?? "").toLowerCase().trim()

  if (s === "approved") {
    return VERIFICATION_STATUS_COPY.verified
  }

  if (
    s === "pending" ||
    s === "in_review" ||
    s === "under_review" ||
    s.includes("review")
  ) {
    return VERIFICATION_STATUS_COPY.inReview
  }

  if (s === "rejected" || s === "hold") {
    return VERIFICATION_STATUS_COPY.actionNeeded
  }

  if (!s || s === "not_started") {
    return opts?.detail
      ? VERIFICATION_STATUS_COPY.notStarted
      : VERIFICATION_STATUS_COPY.unverified
  }

  return VERIFICATION_STATUS_COPY.unverified
}
