import { describe, expect, it } from "vitest"
import {
  PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT,
  PERSONAL_PAYROLL_CONNECTION_LIST_SELECT,
} from "./personal-connection-selects"

describe("personal payroll connection selectors", () => {
  it.each([
    PERSONAL_PAYROLL_CONNECTION_LIST_SELECT,
    PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT,
  ])("does not use the ambiguous payroll_connections/payroll_people embed", (select) => {
    expect(select).not.toContain("payroll_people")
    expect(select).toContain("payroll_payment_methods")
  })
})
