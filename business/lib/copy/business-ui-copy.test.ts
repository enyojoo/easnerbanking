import { describe, expect, it } from "vitest"
import {
  BANNER_COPY,
  BANNER_CTA_COPY,
  PAGE_COPY,
  SETTINGS_TAB_COPY,
  verificationBannerCopy,
  verificationBannerCta,
  verificationBannerHasCta,
  verificationBannerStarted,
} from "./business-ui-copy"

describe("verificationBannerCopy", () => {
  it("uses in-review body when KYB is in_progress", () => {
    expect(verificationBannerCopy("in_progress")).toBe(BANNER_COPY.verificationInReview)
  })

  it("uses in-review body for pending and review statuses", () => {
    expect(verificationBannerCopy("pending")).toBe(BANNER_COPY.verificationInReview)
    expect(verificationBannerCopy("in_review")).toBe(BANNER_COPY.verificationInReview)
  })

  it("uses action-needed body for rejected and hold", () => {
    expect(verificationBannerCopy("rejected")).toBe(BANNER_COPY.verificationActionNeeded)
    expect(verificationBannerCopy("hold")).toBe(BANNER_COPY.verificationActionNeeded)
  })

  it("defaults to start body for not_started", () => {
    expect(verificationBannerCopy("not_started")).toBe(BANNER_COPY.verification)
    expect(verificationBannerCopy(null)).toBe(BANNER_COPY.verification)
  })
})

describe("verificationBannerStarted", () => {
  it("is true when in progress or a Grid customer exists", () => {
    expect(verificationBannerStarted("in_progress", null)).toBe(true)
    expect(verificationBannerStarted("not_started", "cust_123")).toBe(true)
    expect(verificationBannerStarted("not_started", null)).toBe(false)
  })
})

describe("verificationBannerCta", () => {
  it("returns short status CTA for non-managers", () => {
    expect(verificationBannerCta("not_started", { canManage: false })).toBe(BANNER_CTA_COPY.status)
  })

  it("returns Begin for not started", () => {
    expect(verificationBannerCta("not_started")).toBe(BANNER_CTA_COPY.begin)
    expect(verificationBannerCta(null)).toBe(BANNER_CTA_COPY.begin)
  })

  it("returns Continue after KYB has started but is not in review", () => {
    expect(verificationBannerCta("not_started", { started: true })).toBe(BANNER_CTA_COPY.continue)
  })

  it("hides the CTA while Grid is reviewing", () => {
    expect(verificationBannerHasCta("in_progress")).toBe(false)
    expect(verificationBannerHasCta("pending")).toBe(false)
    expect(verificationBannerHasCta("in_review")).toBe(false)
    expect(verificationBannerHasCta("not_started")).toBe(true)
    expect(verificationBannerHasCta("rejected")).toBe(true)
    expect(verificationBannerHasCta("hold")).toBe(true)
  })

  it("returns Retry for rejected and Continue for hold", () => {
    expect(verificationBannerCta("rejected")).toBe(BANNER_CTA_COPY.retry)
    expect(verificationBannerCta("hold")).toBe(BANNER_CTA_COPY.continue)
  })
})

describe("PAGE_COPY collections intros", () => {
  it("keeps links and checkout intros to one short line", () => {
    const words = (value: string) => value.trim().split(/\s+/).length
    expect(words(PAGE_COPY.links.intro)).toBeLessThanOrEqual(12)
    expect(words(PAGE_COPY.checkout.intro)).toBeLessThanOrEqual(12)
  })
})

describe("SETTINGS_TAB_COPY payments intro", () => {
  it("keeps the payments tab intro to one short line", () => {
    const words = (value: string) => value.trim().split(/\s+/).length
    expect(words(SETTINGS_TAB_COPY.payments.intro)).toBeLessThanOrEqual(12)
  })
})
