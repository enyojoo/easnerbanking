import { mobileHubKycCtaLabel, MOBILE_HUB_KYC_CTA } from './hub-kyc-cta'

describe('mobileHubKycCtaLabel', () => {
  it('hides CTA for rejected and in-review', () => {
    expect(mobileHubKycCtaLabel({ status: 'rejected', complete: false })).toBeNull()
    expect(mobileHubKycCtaLabel({ status: 'under_review', complete: false })).toBeNull()
    expect(mobileHubKycCtaLabel({ status: 'in_review', complete: false })).toBeNull()
    expect(mobileHubKycCtaLabel({ status: 'pending', complete: false })).toBeNull()
  })

  it('returns Review and fix for hold', () => {
    expect(mobileHubKycCtaLabel({ status: 'hold', complete: false })).toBe(
      MOBILE_HUB_KYC_CTA.reviewAndFix,
    )
    expect(mobileHubKycCtaLabel({ status: 'hold', complete: false, canResubmit: false })).toBeNull()
  })

  it('returns Continue for in_progress / cutover', () => {
    expect(mobileHubKycCtaLabel({ status: 'in_progress', complete: false })).toBe(
      MOBILE_HUB_KYC_CTA.continue,
    )
    expect(
      mobileHubKycCtaLabel({ status: 'not_started', complete: false, forceContinue: true }),
    ).toBe(MOBILE_HUB_KYC_CTA.continue)
  })

  it('returns Start for not_started', () => {
    expect(mobileHubKycCtaLabel({ status: 'not_started', complete: false })).toBe(
      MOBILE_HUB_KYC_CTA.start,
    )
  })

  it('hides CTA when complete', () => {
    expect(mobileHubKycCtaLabel({ status: 'not_started', complete: true })).toBeNull()
  })
})
