import { describe, expect, it } from "vitest"
import {
  isPayrollSourceAccountId,
  payrollCurrencyFromSourceAccountId,
} from "@/lib/payroll/source-account"

describe("Payroll source account", () => {
  it("derives the Payroll currency from supported balance accounts", () => {
    expect(payrollCurrencyFromSourceAccountId("acc_usd")).toBe("USD")
    expect(payrollCurrencyFromSourceAccountId("acc_eur")).toBe("EUR")
  })

  it("rejects unsupported account identifiers", () => {
    expect(isPayrollSourceAccountId("acc_usd")).toBe(true)
    expect(isPayrollSourceAccountId("acc_eur")).toBe(true)
    expect(isPayrollSourceAccountId("acc_gbp")).toBe(false)
    expect(isPayrollSourceAccountId("external-account")).toBe(false)
  })

  it("uses a supported fallback safely", () => {
    expect(payrollCurrencyFromSourceAccountId(null, "EUR")).toBe("EUR")
    expect(payrollCurrencyFromSourceAccountId(null, "GBP")).toBe("USD")
  })
})
