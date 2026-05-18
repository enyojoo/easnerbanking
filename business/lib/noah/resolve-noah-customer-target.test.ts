import { describe, expect, it } from "vitest"
import {
  EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX,
  noahCustomerIdFromBusinessId,
  parseEasnerNoahCustomerId,
} from "./customer-id"

describe("parseEasnerNoahCustomerId", () => {
  it("parses business ebiz_ ids", () => {
    const businessId = "4769329d-a171-49cf-8647-7e9b8a0128d3"
    const customerId = noahCustomerIdFromBusinessId(businessId)
    expect(customerId.startsWith(EASNER_NOAH_BUSINESS_CUSTOMER_PREFIX)).toBe(true)
    const parsed = parseEasnerNoahCustomerId(customerId)
    expect(parsed).toEqual({ kind: "business", businessId })
  })
})
