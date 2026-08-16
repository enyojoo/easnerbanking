import { describe, expect, it } from "vitest"
import { ebFromBusinessId } from "@easner/shared"
import {
  gridPlatformCustomerIdForRecreate,
  gridPlatformCustomerIdFromBusinessId,
  uuidFromStableSeed,
} from "./customer-id"

const BUSINESS_ID = "fd9c4c9a-a8c8-4019-9475-eb7317894f43"

describe("gridPlatformCustomerIdForRecreate", () => {
  it("is stable for the same business and generation", () => {
    expect(gridPlatformCustomerIdForRecreate(BUSINESS_ID, 1)).toBe(
      gridPlatformCustomerIdForRecreate(BUSINESS_ID, 1),
    )
  })

  it("is not a prefix of the canonical eb_ id", () => {
    const canonical = gridPlatformCustomerIdFromBusinessId(BUSINESS_ID)
    const recreate = gridPlatformCustomerIdForRecreate(BUSINESS_ID, 1)
    expect(recreate.startsWith(canonical)).toBe(false)
    expect(canonical.startsWith(recreate)).toBe(false)
    expect(recreate).toMatch(/^eb_[0-9a-f]{32}$/)
    expect(recreate).toBe(ebFromBusinessId(uuidFromStableSeed(`easner-grid-recreate:1:${BUSINESS_ID}`)))
  })

  it("changes when generation changes", () => {
    expect(gridPlatformCustomerIdForRecreate(BUSINESS_ID, 1)).not.toBe(
      gridPlatformCustomerIdForRecreate(BUSINESS_ID, 2),
    )
  })
})
