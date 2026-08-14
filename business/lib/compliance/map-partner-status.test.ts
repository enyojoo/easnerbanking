import { describe, expect, it } from "vitest"
import { mapGridPartnerStatus, mapNoahPartnerStatus } from "./map-partner-status"

describe("mapGridPartnerStatus", () => {
  it("maps UNVERIFIED and empty to not_started", () => {
    expect(mapGridPartnerStatus("UNVERIFIED")).toBe("not_started")
    expect(mapGridPartnerStatus("")).toBe("not_started")
    expect(mapGridPartnerStatus(null)).toBe("not_started")
    expect(mapGridPartnerStatus(undefined)).toBe("not_started")
  })

  it("maps PENDING to pending", () => {
    expect(mapGridPartnerStatus("PENDING")).toBe("pending")
    expect(mapGridPartnerStatus("pending")).toBe("pending")
  })

  it("maps terminal statuses", () => {
    expect(mapGridPartnerStatus("APPROVED")).toBe("approved")
    expect(mapGridPartnerStatus("REJECTED")).toBe("rejected")
    expect(mapGridPartnerStatus("HOLD")).toBe("hold")
  })
})

describe("mapNoahPartnerStatus", () => {
  it("maps review-like statuses to pending", () => {
    expect(mapNoahPartnerStatus("in_review")).toBe("pending")
    expect(mapNoahPartnerStatus("pending")).toBe("pending")
  })
})
