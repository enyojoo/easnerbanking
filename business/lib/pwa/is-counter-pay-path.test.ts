import { describe, expect, it } from "vitest"
import { isCounterPayPath } from "./is-counter-pay-path"

describe("isCounterPayPath", () => {
  it("includes only the public pay route and its children", () => {
    expect(isCounterPayPath("/pay")).toBe(true)
    expect(isCounterPayPath("/pay/asset")).toBe(true)
    expect(isCounterPayPath("/pay/charge/session-1")).toBe(true)
  })

  it("does not treat internal Payroll pages as counter-payment pages", () => {
    expect(isCounterPayPath("/payroll")).toBe(false)
    expect(isCounterPayPath("/payroll/people")).toBe(false)
    expect(isCounterPayPath("/payments")).toBe(false)
  })
})
