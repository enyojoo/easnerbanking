import { describe, expect, it } from "vitest"
import {
  ebFromBusinessId,
  eiFromUserId,
  parseGridPlatformCustomerId,
} from "./customer-external-id"

const ENYO_BUSINESS_ID = "fd9c4c9a-a8c8-4019-9475-eb7317894f43"

describe("customer-external-id", () => {
  it("builds eb_ from business uuid", () => {
    const eb = ebFromBusinessId(ENYO_BUSINESS_ID)
    expect(eb).toBe("eb_fd9c4c9aa8c840199475eb7317894f43")
    expect(eb).toHaveLength(35)
  })

  it("builds ei_ from user uuid", () => {
    const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    expect(eiFromUserId(userId)).toBe("ei_a1b2c3d4e5f67890abcdef1234567890")
    expect(eiFromUserId(userId)).toHaveLength(35)
  })

  it("round-trips eb_ and ei_", () => {
    const eb = ebFromBusinessId(ENYO_BUSINESS_ID)
    expect(parseGridPlatformCustomerId(eb)).toEqual({
      kind: "business",
      businessId: ENYO_BUSINESS_ID,
    })
    const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    expect(parseGridPlatformCustomerId(eiFromUserId(userId))).toEqual({
      kind: "individual",
      userId,
    })
  })

  it("rejects unknown prefixes", () => {
    expect(parseGridPlatformCustomerId("easner_business_abc")).toBeNull()
    expect(parseGridPlatformCustomerId("ebiz_abc")).toBeNull()
    expect(parseGridPlatformCustomerId("")).toBeNull()
  })

  it("requires non-empty ids", () => {
    expect(() => ebFromBusinessId("")).toThrow(/businessId/)
    expect(() => eiFromUserId("  ")).toThrow(/userId/)
  })
})
