/** Hub CTA for Global banking on mobile. Mirrors businessHubKybCtaLabel with short labels. */

export const MOBILE_HUB_KYC_CTA = {
  start: 'Start',
  continue: 'Continue',
  reviewAndFix: 'Review and fix',
} as const

export const MOBILE_HUB_KYC_HOLD_COPY =
  'We need a bit more information. Review what’s needed and update it.'

function statusIsInReview(status: string): boolean {
  if (status === 'in_progress') return false
  return (
    status === 'pending' ||
    status === 'in_review' ||
    status === 'under_review' ||
    status.includes('review')
  )
}

/**
 * Product-card CTA for consumer bank KYC (Bridge primary; Noah NY/legacy).
 * `rejected` is always terminal — no Start. `hold` is the retryable path.
 */
export function mobileHubKycCtaLabel(input: {
  status: string | null | undefined
  complete: boolean
  startedNotSubmitted?: boolean
  canResubmit?: boolean
  /** When true (e.g. cutover), treat as continue even if status looks not_started. */
  forceContinue?: boolean
}): string | null {
  if (input.complete) return null
  const status = String(input.status ?? '').toLowerCase()
  if (statusIsInReview(status)) return null
  if (status === 'rejected') return null
  if (status === 'hold') {
    if (input.canResubmit === false) return null
    return MOBILE_HUB_KYC_CTA.reviewAndFix
  }
  if (status === 'in_progress' || input.startedNotSubmitted || input.forceContinue) {
    return MOBILE_HUB_KYC_CTA.continue
  }
  return MOBILE_HUB_KYC_CTA.start
}

export function mobileHubKycStatusIsInReview(status: string | null | undefined): boolean {
  return statusIsInReview(String(status ?? '').toLowerCase())
}
