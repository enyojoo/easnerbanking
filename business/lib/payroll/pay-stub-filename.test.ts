import { describe, expect, it } from "vitest"
import {
  resolvePayStubFilename,
  resolvePayStubStoragePath,
  sanitizePayStubLabel,
} from "./pay-stub-filename"

describe("pay stub filenames", () => {
  it("uses a connected EASETAG without @", () => {
    expect(resolvePayStubFilename({ easetag: "@Amina.Pay", fullName: "Amina Doe" }))
      .toBe("pay-stub-amina-pay.pdf")
  })

  it("uses the first name for a manual person", () => {
    expect(resolvePayStubFilename({ fullName: "Jöhn O'Connor" })).toBe("pay-stub-john.pdf")
  })

  it("uses a safe fallback", () => {
    expect(sanitizePayStubLabel("💸")).toBe("recipient")
  })

  it("builds a line-unique private storage key", () => {
    expect(resolvePayStubStoragePath({
      businessId: "business-123",
      runId: "run-456",
      lineId: "line-789",
      filename: "pay-stub-amina.pdf",
    })).toBe("business-123/run-456/line-789/pay-stub-amina.pdf")
  })
})
