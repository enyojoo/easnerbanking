import { describe, expect, it } from "vitest"
import {
  extractNoahRejectionReasons,
  formatNoahRejectionReasonsText,
  isPlaceholderNoahRejectionReasons,
  pickNoahRejectionReasonsToStore,
} from "./rejection-reasons"

describe("extractNoahRejectionReasons", () => {
  it("reads EntityVerifications RejectionData.PublicComment from Customer webhooks", () => {
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
        reason:
          "Some associated parties in the company's control or ownership structure have been rejected.",
        message:
          "Some associated parties in the company's control or ownership structure have been rejected.",
        rejectType: "Final",
      },
    ])
    expect(formatNoahRejectionReasonsText(reasons)).toContain("associated parties")
  })

  it("does not invent a regional decline when PublicComment is empty", () => {
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
        message:
          "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
      },
    ])
    expect(isPlaceholderNoahRejectionReasons(reasons)).toBe(true)
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
