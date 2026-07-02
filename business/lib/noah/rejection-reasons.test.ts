import { describe, expect, it } from "vitest"
import {
  extractNoahRejectionReasons,
  formatNoahRejectionReasonsText,
  getNoahRejectionDisplay,
  isPlaceholderNoahRejectionReasons,
  pickNoahRejectionReasonsToStore,
} from "./rejection-reasons"

describe("extractNoahRejectionReasons", () => {
  it("reads EntityVerifications RejectionData with RejectLabels[] and Final type", () => {
    const reasons = extractNoahRejectionReasons({
      Type: "Business",
      Verifications: {
        Status: "Declined",
        EntityVerifications: [
          {
            Entity: "Lt",
            Status: "Declined",
            RejectionData: {
              RejectType: "Final",
              RejectLabels: ["BAD_PROOF_OF_IDENTITY"],
              PublicComment:
                "Some associated parties in the company's control or ownership structure have been rejected.",
            },
          },
        ],
      },
    })

    expect(reasons).toEqual([
      {
        entity: "Lt",
        status: "Declined",
        rejectType: "Final",
        rejectLabels: ["BAD_PROOF_OF_IDENTITY"],
      },
    ])
    expect(getNoahRejectionDisplay(reasons).isFinal).toBe(true)
    expect(formatNoahRejectionReasonsText(reasons)).toBe("")
  })

  it("stores Retry with PublicComment and RejectLabels", () => {
    const reasons = extractNoahRejectionReasons({
      Verifications: {
        EntityVerifications: [
          {
            Entity: "Individual",
            Status: "Declined",
            RejectionData: {
              RejectType: "Retry",
              RejectLabels: ["UNSATISFACTORY_PHOTOS"],
              PublicComment: "Please retake your selfie in better lighting.",
            },
          },
        ],
      },
    })

    expect(reasons[0]).toMatchObject({
      rejectType: "Retry",
      rejectLabels: ["UNSATISFACTORY_PHOTOS"],
      publicComment: "Please retake your selfie in better lighting.",
    })
    expect(getNoahRejectionDisplay(reasons).canResubmit).toBe(true)
  })

  it("does not invent placeholder when Final has empty PublicComment", () => {
    const reasons = extractNoahRejectionReasons({
      Verifications: {
        Status: "Declined",
        EntityVerifications: [
          {
            Entity: "Lt",
            Status: "Declined",
            RejectionData: { RejectType: "Final", PublicComment: "" },
          },
        ],
      },
    })

    expect(reasons).toEqual([
      {
        entity: "Lt",
        status: "Declined",
        rejectType: "Final",
      },
    ])
  })

  it("skips placeholder regional decline strings", () => {
    const reasons = extractNoahRejectionReasons({
      Verifications: {
        EntityVerifications: [
          {
            Status: "Declined",
            RejectionData: {
              RejectType: "Retry",
              PublicComment: "Verification declined for this region.",
            },
          },
        ],
      },
    })
    expect(reasons).toEqual([])
  })
})

describe("pickNoahRejectionReasonsToStore", () => {
  const specific = [
    {
      entity: "Lt",
      message:
        "Some associated parties in the company's control or ownership structure have been rejected.",
      reason:
        "Some associated parties in the company's control or ownership structure have been rejected.",
    },
  ]

  const placeholder = [
    {
      message:
        "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
    },
  ]

  it("keeps existing webhook detail when a later sync only has placeholder reasons", () => {
    expect(pickNoahRejectionReasonsToStore(specific, placeholder)).toEqual(specific)
  })

  it("replaces placeholder reasons when webhook detail arrives", () => {
    expect(pickNoahRejectionReasonsToStore(placeholder, specific)).toEqual(specific)
  })

  it("stores incoming reasons when nothing exists yet", () => {
    expect(pickNoahRejectionReasonsToStore(null, specific)).toEqual(specific)
  })
})
