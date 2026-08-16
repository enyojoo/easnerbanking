import { describe, expect, it } from "vitest"
import {
  BANNER_COPY,
  BANNER_CTA_COPY,
  verificationBannerCopy,
  verificationBannerCta,
  verificationBannerStarted,
} from "./business-ui-copy"

describe("verificationBannerCopy", () => {
  it("uses in-progress body when KYB is in_progress", () => {
    expect(verificationBannerCopy("in_progress")).toBe(BANNER_COPY.verificationInProgress)
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

  it("returns View while KYB is in progress", () => {
    expect(verificationBannerCta("in_progress")).toBe(BANNER_CTA_COPY.viewProgress)
    expect(verificationBannerCta("not_started", { started: true })).toBe(BANNER_CTA_COPY.continue)
  })

  it("returns Status while in review", () => {
    expect(verificationBannerCta("pending")).toBe(BANNER_CTA_COPY.status)
    expect(verificationBannerCta("in_review")).toBe(BANNER_CTA_COPY.status)
    expect(verificationBannerCta("in_review", { started: true })).toBe(BANNER_CTA_COPY.status)
    expect(verificationBannerCta("pending", { started: true })).toBe(BANNER_CTA_COPY.status)
  })

  it("returns Retry for rejected and Continue for hold", () => {
    expect(verificationBannerCta("rejected")).toBe(BANNER_CTA_COPY.retry)
    expect(verificationBannerCta("hold")).toBe(BANNER_CTA_COPY.continue)
  })
})
