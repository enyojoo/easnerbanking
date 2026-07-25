import { describe, expect, it } from "vitest"
import { isNavPathActive } from "@/lib/navigation/is-nav-path-active"

describe("isNavPathActive", () => {
  it("keeps Payroll active throughout its route tree", () => {
    expect(isNavPathActive("/payroll", "/payroll")).toBe(true)
    expect(isNavPathActive("/payroll/people/new", "/payroll")).toBe(true)
    expect(isNavPathActive("/payroll/runs/run-123", "/payroll")).toBe(true)
    expect(isNavPathActive("/payroll/settings", "/payroll")).toBe(true)
  })

  it("does not match routes that only share a text prefix", () => {
    expect(isNavPathActive("/payroll-report", "/payroll")).toBe(false)
    expect(isNavPathActive("/send-money", "/send")).toBe(false)
  })
})
