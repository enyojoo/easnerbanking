import { describe, expect, it } from "vitest"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"
import { businessHubKybCtaLabel } from "./hub-kyb-cta"

describe("businessHubKybCtaLabel", () => {
  it("uses Begin verification for a fresh rail", () => {
    expect(
      businessHubKybCtaLabel({ status: "not_started", complete: false }),
    ).toBe(VERIFICATION_SECTION_COPY.beginVerificationCta)
  })

  it("uses Continue verification once started", () => {
    expect(
      businessHubKybCtaLabel({ status: "in_progress", complete: false }),
    ).toBe(VERIFICATION_SECTION_COPY.continueVerificationCta)
    expect(
      businessHubKybCtaLabel({
        status: "not_started",
        complete: false,
        startedNotSubmitted: true,
      }),
    ).toBe(VERIFICATION_SECTION_COPY.continueVerificationCta)
  })

  it("hides the button while in review or complete", () => {
    expect(businessHubKybCtaLabel({ status: "pending", complete: false })).toBeNull()
    expect(businessHubKybCtaLabel({ status: "approved", complete: true })).toBeNull()
  })

  it("uses Review and fix on hold when resubmit is allowed", () => {
    expect(
      businessHubKybCtaLabel({ status: "hold", complete: false, canResubmit: true }),
    ).toBe(VERIFICATION_SECTION_COPY.reviewAndFixCta)
  })

  it("hides the button on rejected KYB even if stale retry flags remain", () => {
    expect(businessHubKybCtaLabel({ status: "rejected", complete: false })).toBeNull()
    expect(
      businessHubKybCtaLabel({
        status: "rejected",
        complete: false,
        canResubmit: true,
      }),
    ).toBeNull()
    expect(
      businessHubKybCtaLabel({ status: "rejected", complete: false, finalReject: true }),
    ).toBeNull()
  })
})
