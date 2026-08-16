function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readReviewStatus(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) return ""
  const nested = asRecord(root.review)
  return String(root.reviewStatus ?? nested?.reviewStatus ?? "").trim().toLowerCase()
}

function readDocSets(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload)
  if (!root) return []
  const required = asRecord(root.requiredIdDocs) ?? asRecord(root.requiredIdDocsStatus)
  const raw = required?.docSets ?? root.docSets
  return Array.isArray(raw) ? raw.filter((row): row is Record<string, unknown> => Boolean(asRecord(row))) : []
}

function docSetStatus(row: Record<string, unknown>): string {
  return String(row.status ?? row.reviewStatus ?? "").trim().toLowerCase()
}

function docSetStillRequired(row: Record<string, unknown>): boolean {
  const status = docSetStatus(row)
  if (status === "approved" || status === "completed" || status === "submitted" || status === "ok") {
    return false
  }
  if (status === "pending" || status === "init" || status === "incomplete" || status === "requested") {
    return true
  }
  const images = row.imageIds ?? row.images
  return Array.isArray(images) ? images.length === 0 : status.length === 0
}

/**
 * Hosted SumSub keeps files in SumSub — they never show on Grid `/documents`.
 * Reopening with no remaining step is the real "ID uploaded / in review" signal.
 */
export function sumsubApplicantHasNoRequiredAction(payload: unknown): boolean {
  const reviewStatus = readReviewStatus(payload)
  const docSets = readDocSets(payload)
  const identitySets = docSets.filter((row) =>
    sumsubStepIsIdentityDocument(String(row.idDocSetType ?? row.type ?? "")),
  )
  if (identitySets.length > 0) {
    return !identitySets.some(docSetStillRequired)
  }
  return (
    reviewStatus === "completed" ||
    reviewStatus === "queued" ||
    reviewStatus === "prechecked"
  )
}

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
  if (s === "identity_submitted" || s === "no_action_required") return true
  // Company submit also fires onApplicantSubmitted; only treat as UBO ID if KYB already in_progress.
  return s === "applicant_submitted" && alreadyInProgress
}

/** After ID submit, keep terminal Grid statuses; otherwise treat as in review. */
export function gridStatusAfterApplicantSubmitted(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase()
  if (s === "approved" || s === "rejected" || s === "hold" || s === "pending") return s
  return "pending"
}
