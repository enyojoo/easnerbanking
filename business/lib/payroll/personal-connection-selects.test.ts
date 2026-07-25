import { describe, expect, it } from "vitest"
import {
  PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT,
  PERSONAL_PAYROLL_CONNECTION_LIST_SELECT,
  PERSONAL_PAYROLL_METHOD_SELECT,
} from "./personal-connection-selects"

describe("personal payroll connection selectors", () => {
  it.each([
    PERSONAL_PAYROLL_CONNECTION_LIST_SELECT,
    PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT,
  ])("does not use ambiguous payroll connection embeds", (select) => {
    expect(select).not.toContain("payroll_people")
    expect(select).not.toContain("payroll_payment_methods")
  })

  it("loads payment methods explicitly with their connection key", () => {
    expect(PERSONAL_PAYROLL_METHOD_SELECT).toContain("connection_id")
    expect(PERSONAL_PAYROLL_METHOD_SELECT).not.toContain("payroll_connections")
  })
})
