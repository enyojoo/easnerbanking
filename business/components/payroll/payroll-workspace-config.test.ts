import { describe, expect, it } from "vitest"
import {
  PAYROLL_WORKSPACE_TABS,
  payrollWorkspaceTabForPath,
} from "./payroll-workspace-config"

describe("Payroll workspace routing", () => {
  it.each([
    ["/payroll", "overview"],
    ["/payroll/people", "people"],
    ["/payroll/runs", "runs"],
    ["/payroll/schedules", "schedules"],
    ["/payroll/settings", "settings"],
  ])("maps %s to the %s tab", (pathname, tab) => {
    expect(payrollWorkspaceTabForPath(pathname)?.id).toBe(tab)
  })

  it.each([
    "/payroll/people/new",
    "/payroll/people/person-1",
    "/payroll/runs/new",
    "/payroll/runs/run-1",
    "/payroll/schedules/new",
    "/payroll/schedules/schedule-1/edit",
  ])("does not mount workspace tabs on %s", (pathname) => {
    expect(payrollWorkspaceTabForPath(pathname)).toBeNull()
  })

  it("keeps the five primary routes unique", () => {
    expect(new Set(PAYROLL_WORKSPACE_TABS.map((tab) => tab.href)).size).toBe(5)
  })
})
