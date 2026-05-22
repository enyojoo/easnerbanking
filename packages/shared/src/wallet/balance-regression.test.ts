import { describe, expect, it } from "vitest"
import { isSuspiciousAuthoritativeZeroRegression } from "./balance-regression"

describe("isSuspiciousAuthoritativeZeroRegression", () => {
  it("detects sudden all-zero authoritative reads", () => {
    expect(
      isSuspiciousAuthoritativeZeroRegression("realtime", "0", "0", { USD: "1.00", EUR: "0" }),
    ).toBe(true)
  })

  it("ignores non-authoritative sources", () => {
    expect(
      isSuspiciousAuthoritativeZeroRegression("none", "0", "0", { USD: "9.00", EUR: "0" }),
    ).toBe(false)
  })
})
