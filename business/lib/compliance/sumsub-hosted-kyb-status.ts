/** Terminal Sumsub review statuses for `onApplicantStatusChanged` (not initial load). */
export function sumsubReviewStatusTriggersComplete(reviewStatus: string | null | undefined): boolean {
  const s = String(reviewStatus ?? "").toLowerCase()
  // `onHold` is the applicant's current state when reopening — not "user finished".
  // `pending` fires mid-KYB when only some steps are done.
  return s === "completed"
}

/** Sync Grid after a step change. Skip `init` so opening the SDK does not POST sync-status. */
export function sumsubReviewStatusShouldSyncGrid(reviewStatus: string | null | undefined): boolean {
  const s = String(reviewStatus ?? "").toLowerCase()
  return s === "pending" || s === "completed" || s === "onhold"
}

/** Close hosted KYB only when Grid says submitted/review/terminal — not mid-flow `in_progress`. */
export function gridKybStatusClosesHostedFlow(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase()
  return s === "pending" || s === "approved" || s === "hold" || s === "rejected"
}
