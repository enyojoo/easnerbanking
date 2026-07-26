import { describe, expect, it } from "vitest"
import { sanitizePayrollExecutionError } from "./execution-error"

describe("sanitizePayrollExecutionError", () => {
  it("redacts account, wallet, and IBAN-like values", () => {
    const message = sanitizePayrollExecutionError(
      "Provider rejected account 0123456789 for wallet 0x1234567890abcdef1234567890abcdef and GB29NWBK60161331926819",
    )
    expect(message).not.toContain("0123456789")
    expect(message).not.toContain("0x1234567890abcdef1234567890abcdef")
    expect(message).not.toContain("GB29NWBK60161331926819")
    expect(message).toContain("[redacted]")
  })

  it("uses a safe fallback and bounds stored errors", () => {
    expect(sanitizePayrollExecutionError("")).toBe("Payroll execution failed.")
    expect(sanitizePayrollExecutionError("ordinary ".repeat(100)).length).toBeLessThanOrEqual(300)
  })
})
