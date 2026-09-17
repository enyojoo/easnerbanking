import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"

function statusIsInReview(status: string): boolean {
  if (status === "in_progress") return false
  return status === "pending" || status === "in_review" || status === "under_review" || status.includes("review")
}

/** Hub CTA for Global banking and More accounts. Same labels; hide while in review. */
export function businessHubKybCtaLabel(input: {
  status: string | null | undefined
  complete: boolean
  startedNotSubmitted?: boolean
  canResubmit?: boolean
  finalReject?: boolean
}): string | null {
  if (input.complete || input.finalReject) return null
  const status = String(input.status ?? "").toLowerCase()
  if (statusIsInReview(status)) return null
  // Grid REJECTED is terminal. HOLD is the retryable "need more info" state.
  if (status === "rejected") return null
  if (status === "hold") {
    if (input.canResubmit === false) return null
    return VERIFICATION_SECTION_COPY.reviewAndFixCta
  }
  if (status === "in_progress" || input.startedNotSubmitted) {
    return VERIFICATION_SECTION_COPY.continueVerificationCta
  }
  return VERIFICATION_SECTION_COPY.beginVerificationCta
}
