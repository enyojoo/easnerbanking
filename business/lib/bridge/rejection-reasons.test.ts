import { describe, expect, it } from "vitest"
import { parseBridgeRejectionNotices } from "./rejection-reasons"

describe("parseBridgeRejectionNotices", () => {
  it("splits the customer reason from the compliance developer reason", () => {
    const notices = parseBridgeRejectionNotices({
      rejection_reasons: [
        {
          reason: "Your information could not be verified",
          developer_reason: "Bridge is unable to support this individual.",
        },
      ],
    })
    expect(notices.customerReasons).toEqual(["Your information could not be verified"])
    expect(notices.complianceReasons).toEqual(["Bridge is unable to support this individual."])
    expect(notices.stored).toEqual([
      {
        reason: "Your information could not be verified",
        developer_reason: "Bridge is unable to support this individual.",
      },
    ])
  })
})
