import { describe, expect, it } from "vitest"
import { DEFAULT_YC_PAYMENT_REASON, resolveYcPaymentReason } from "./yc-payment-reason"

describe("resolveYcPaymentReason", () => {
  it("defaults to other when empty", () => {
    expect(resolveYcPaymentReason()).toBe(DEFAULT_YC_PAYMENT_REASON)
    expect(resolveYcPaymentReason("")).toBe(DEFAULT_YC_PAYMENT_REASON)
  })

  it("accepts canonical YC reasons", () => {
    expect(resolveYcPaymentReason("gift")).toBe("gift")
    expect(resolveYcPaymentReason("school-fees")).toBe("school-fees")
  })

  it("maps internal debug slugs to other", () => {
    expect(resolveYcPaymentReason("balance_payout_quote")).toBe("other")
    expect(resolveYcPaymentReason("fund_balance")).toBe("other")
    expect(resolveYcPaymentReason("cross_border_leg1")).toBe("other")
  })

  it("maps Noah/Easner purpose labels", () => {
    expect(resolveYcPaymentReason("Family Maintenance")).toBe("other")
    expect(resolveYcPaymentReason("personal transfer")).toBe("other")
    expect(resolveYcPaymentReason("Education fees")).toBe("school-fees")
    expect(resolveYcPaymentReason("Medical treatment")).toBe("health")
  })
})
