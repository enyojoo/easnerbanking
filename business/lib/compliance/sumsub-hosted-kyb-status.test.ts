import { describe, expect, it } from "vitest"
import {
  gridKybStatusClosesHostedFlow,
  gridStatusAfterApplicantSubmitted,
  sumsubApplicantHasNoRequiredAction,
  sumsubReviewStatusMarksApplicantSubmitted,
  sumsubReviewStatusShouldSyncGrid,
  sumsubReviewStatusTriggersComplete,
  sumsubStepIsIdentityDocument,
} from "./sumsub-hosted-kyb-status"

describe("sumsubReviewStatusTriggersComplete", () => {
  it("closes only on completed, not mid-flow pending or reopen onHold", () => {
    expect(sumsubReviewStatusTriggersComplete("completed")).toBe(true)
    expect(sumsubReviewStatusTriggersComplete("onhold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("onHold")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("pending")).toBe(false)
    expect(sumsubReviewStatusTriggersComplete("init")).toBe(false)
  })
})

describe("sumsubReviewStatusShouldSyncGrid", () => {
  it("syncs after a step, not on SDK init", () => {
    expect(sumsubReviewStatusShouldSyncGrid("pending")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("completed")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("onHold")).toBe(true)
    expect(sumsubReviewStatusShouldSyncGrid("init")).toBe(false)
  })
})

describe("gridKybStatusClosesHostedFlow", () => {
  it("closes when Grid is in review or terminal, not mid-flow", () => {
    expect(gridKybStatusClosesHostedFlow("pending")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("approved")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("hold")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("rejected")).toBe(true)
    expect(gridKybStatusClosesHostedFlow("in_progress")).toBe(false)
    expect(gridKybStatusClosesHostedFlow("not_started")).toBe(false)
  })
})

describe("sumsubStepIsIdentityDocument", () => {
  it("matches UBO identity sets only", () => {
    expect(sumsubStepIsIdentityDocument("IDENTITY")).toBe(true)
    expect(sumsubStepIsIdentityDocument("IDENTITY2")).toBe(true)
    expect(sumsubStepIsIdentityDocument("COMPANY")).toBe(false)
    expect(sumsubStepIsIdentityDocument("QUESTIONNAIRE")).toBe(false)
  })
})

describe("sumsubReviewStatusMarksApplicantSubmitted", () => {
  it("marks in-review after UBO ID step, not company pending or review completed", () => {
    expect(sumsubReviewStatusMarksApplicantSubmitted("no_action_required")).toBe(true)
    expect(sumsubReviewStatusMarksApplicantSubmitted("identity_submitted")).toBe(true)
    expect(sumsubReviewStatusMarksApplicantSubmitted("applicant_submitted", true)).toBe(true)
    expect(sumsubReviewStatusMarksApplicantSubmitted("applicant_submitted", false)).toBe(false)
    expect(sumsubReviewStatusMarksApplicantSubmitted("completed")).toBe(false)
    expect(sumsubReviewStatusMarksApplicantSubmitted("pending")).toBe(false)
    expect(sumsubReviewStatusMarksApplicantSubmitted("init")).toBe(false)
  })
})

describe("sumsubApplicantHasNoRequiredAction", () => {
  it("treats completed identity doc sets as no action", () => {
    expect(
      sumsubApplicantHasNoRequiredAction({
        reviewStatus: "pending",
        requiredIdDocs: {
          docSets: [{ idDocSetType: "IDENTITY", status: "submitted" }],
        },
      }),
    ).toBe(true)
  })

  it("keeps action required while identity set is still pending", () => {
    expect(
      sumsubApplicantHasNoRequiredAction({
        reviewStatus: "pending",
        requiredIdDocs: {
          docSets: [{ idDocSetType: "IDENTITY", status: "pending" }],
        },
      }),
    ).toBe(false)
  })

  it("treats queued review without remaining identity as no action", () => {
    expect(sumsubApplicantHasNoRequiredAction({ reviewStatus: "queued" })).toBe(true)
  })
})

describe("gridStatusAfterApplicantSubmitted", () => {
  it("promotes in_progress to pending when Grid sends no review webhook", () => {
    expect(gridStatusAfterApplicantSubmitted("in_progress")).toBe("pending")
    expect(gridStatusAfterApplicantSubmitted("not_started")).toBe("pending")
    expect(gridStatusAfterApplicantSubmitted("approved")).toBe("approved")
    expect(gridStatusAfterApplicantSubmitted("pending")).toBe("pending")
  })
})
