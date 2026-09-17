import { describe, expect, it } from "vitest"
import {
  VERIFICATION_STATUS_COPY,
  verificationStatusLabel,
} from "./verification-status-copy"

describe("verificationStatusLabel", () => {
  it("returns Verified when complete", () => {
    expect(verificationStatusLabel(null, { complete: true })).toBe(
      VERIFICATION_STATUS_COPY.verified,
    )
  })

  it("maps approved to Verified", () => {
    expect(verificationStatusLabel("approved")).toBe(VERIFICATION_STATUS_COPY.verified)
  })

  it("maps in_progress to In progress", () => {
    expect(verificationStatusLabel("in_progress")).toBe(VERIFICATION_STATUS_COPY.inProgress)
  })

  it("maps review states to In review", () => {
    expect(verificationStatusLabel("pending")).toBe(VERIFICATION_STATUS_COPY.inReview)
    expect(verificationStatusLabel("in_review")).toBe(VERIFICATION_STATUS_COPY.inReview)
    expect(verificationStatusLabel("under_review")).toBe(VERIFICATION_STATUS_COPY.inReview)
  })

  it("maps hold to Action needed and rejected to Rejected", () => {
    expect(verificationStatusLabel("hold")).toBe(VERIFICATION_STATUS_COPY.actionNeeded)
    expect(verificationStatusLabel("rejected")).toBe(VERIFICATION_STATUS_COPY.rejected)
  })

  it("maps empty/not_started to Unverified or Not started", () => {
    expect(verificationStatusLabel(null)).toBe(VERIFICATION_STATUS_COPY.unverified)
    expect(verificationStatusLabel("not_started")).toBe(VERIFICATION_STATUS_COPY.unverified)
    expect(verificationStatusLabel(null, { detail: true })).toBe(
      VERIFICATION_STATUS_COPY.notStarted,
    )
    expect(verificationStatusLabel("not_started", { detail: true })).toBe(
      VERIFICATION_STATUS_COPY.notStarted,
    )
  })
})
