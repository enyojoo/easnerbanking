import { describe, expect, it } from "vitest"
import {
  classifyPayEasnerSingleSegment,
  isPaymentLinkPublicId,
  paymentLinkPublicIdToUuid,
  toPaymentLinkPublicId,
} from "./public-id"

const UUID = "550e8400-e29b-41d4-a716-446655440000"

describe("payment link public id", () => {
  it("round-trips uuid via plink_ prefix", () => {
    const publicId = toPaymentLinkPublicId(UUID)
    expect(publicId).toBe("plink_550e8400e29b41d4a716446655440000")
    expect(isPaymentLinkPublicId(publicId)).toBe(true)
    expect(paymentLinkPublicIdToUuid(publicId)).toBe(UUID)
  })

  it("disambiguates plink_ from terminal session uuid", () => {
    expect(classifyPayEasnerSingleSegment("plink_550e8400e29b41d4a716446655440000")).toBe("payment_link")
    expect(classifyPayEasnerSingleSegment(UUID)).toBe("terminal_session")
  })
})
