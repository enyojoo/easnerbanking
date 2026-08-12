import { describe, expect, it } from "vitest"
import {
  buildRetryGuidanceFromReasons,
  getNoahRejectionDisplay,
  guidanceForRejectLabel,
  isPlaceholderNoahRejectionReasons,
  parseStoredNoahRejectionReasons,
} from "./noah-rejection"

describe("noah-rejection display", () => {
  it("maps known RejectLabels to guidance", () => {
    expect(guidanceForRejectLabel("BAD_PROOF_OF_IDENTITY")).toContain("physical")
    expect(
      buildRetryGuidanceFromReasons([
        { rejectLabels: ["BAD_PROOF_OF_IDENTITY", "EXPIRATION_DATE"] },
      ]),
    ).toHaveLength(2)
  })

  it("Retry falls back to PublicComment", () => {
    const display = getNoahRejectionDisplay([
      {
        rejectType: "Retry",
        publicComment: "Please upload a clearer photo of your passport.",
      },
    ])
    expect(display.canResubmit).toBe(true)
    expect(display.bodyText).toContain("clearer photo")
  })

  it("Final never shows reason text", () => {
    const display = getNoahRejectionDisplay([
      {
        rejectType: "Final",
        publicComment: "Should not show",
        message: "Verification declined for this region.",
      },
    ])
    expect(display.isFinal).toBe(true)
    expect(display.canResubmit).toBe(false)
    expect(display.guidanceLines).toHaveLength(0)
    expect(display.bodyText).not.toContain("region")
    expect(display.bodyText).not.toContain("Should not show")
  })

  it("ignores placeholder regional strings in Retry parsing", () => {
    const parsed = parseStoredNoahRejectionReasons([
      { message: "Verification declined for this region." },
    ])
    expect(parsed).toHaveLength(0)
    expect(isPlaceholderNoahRejectionReasons([{ message: "Verification declined for this region." }])).toBe(
      true,
    )
  })
})

describe("noah-restricted-geographies", () => {
  it("blocks GB on Mobile Noah pre-screen", async () => {
    const { isNoahRestrictedGeography } = await import("./noah-restricted-geographies")
    expect(isNoahRestrictedGeography("GB")).toBe(true)
    expect(isNoahRestrictedGeography("gb")).toBe(true)
  })
})
