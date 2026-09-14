import { describe, expect, it } from "vitest"
import { buildMobileBridgeCutoverEmail } from "./cutover-comms"

describe("buildMobileBridgeCutoverEmail", () => {
  it("never names providers", () => {
    const email = buildMobileBridgeCutoverEmail({
      firstName: "Alex",
      verifyUrl: "https://app.easner.com/user/verification",
      deadlineAt: "2026-09-28T00:00:00.000Z",
    })
    expect(email.subject).toMatch(/verification/i)
    expect(email.text).not.toMatch(/Noah|Bridge|Grid/i)
    expect(email.html).not.toMatch(/Noah|Bridge|Grid/i)
    expect(email.text).toContain("https://app.easner.com/user/verification")
  })
})
