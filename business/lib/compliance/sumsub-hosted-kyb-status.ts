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

/** SumSub `onStepCompleted.idDocSetType` for the UBO identity/ID upload. */
export function sumsubStepIsIdentityDocument(idDocSetType: string | null | undefined): boolean {
  const s = String(idDocSetType ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (
    s === "IDENTITY" ||
    s === "IDENTITY2" ||
    s === "IDENTITY_DOC" ||
    s === "IDENTITY_DOCUMENTS" ||
    s === "ID_DOC" ||
    s === "ID_DOCUMENTS" ||
    s === "PASSPORT"
  )
}

/**
 * Mark in-review only after the UBO ID step.
 * `completed` is SumSub review finished — not the upload. Company `pending` is mid-flow.
 */
export function sumsubReviewStatusMarksApplicantSubmitted(
  reviewStatus: string | null | undefined,
  alreadyInProgress = false,
): boolean {
  const s = String(reviewStatus ?? "").toLowerCase()
  if (s === "identity_submitted") return true
  // Company submit also fires onApplicantSubmitted; only treat as UBO ID if KYB already in_progress.
  return s === "applicant_submitted" && alreadyInProgress
}

/** After ID submit, keep terminal Grid statuses; otherwise treat as in review. */
export function gridStatusAfterApplicantSubmitted(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase()
  if (s === "approved" || s === "rejected" || s === "hold" || s === "pending") return s
  return "pending"
}
