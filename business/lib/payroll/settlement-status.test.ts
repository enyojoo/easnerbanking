import { describe, expect, it } from "vitest"
import { classifyPayrollSettlementStatus } from "./settlement-status"

describe("classifyPayrollSettlementStatus", () => {
  it.each(["settled", "completed", "success", "succeeded", "paid"])(
    "treats %s as authoritative settlement",
    (status) => {
      expect(classifyPayrollSettlementStatus(status)).toBe("settled")
    },
  )

  it.each(["failed", "rejected", "cancelled", "canceled"])(
    "treats %s as terminal failure",
    (status) => {
      expect(classifyPayrollSettlementStatus(status)).toBe("failed")
    },
  )

  it.each(["pending", "processing", "submitted", "", null])(
    "keeps %s processing",
    (status) => {
      expect(classifyPayrollSettlementStatus(status)).toBe("processing")
    },
  )
})
