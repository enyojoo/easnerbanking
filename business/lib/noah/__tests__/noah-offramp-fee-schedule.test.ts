import { describe, expect, it } from "vitest"
import {
  computeNoahOfframpScheduleFee,
  findNoahOfframpScheduleRow,
  resolveNoahOfframpPaymentMethodKey,
} from "@/lib/noah/noah-offramp-fee-schedule"

describe("noah-offramp-fee-schedule", () => {
  it("resolves NGN bank schedule", () => {
    const row = findNoahOfframpScheduleRow({
      currency: "NGN",
      countryCode: "NG",
      paymentMethodCategory: "Bank",
    })
    expect(row?.fixedUsd).toBe(0.5)
    expect(row?.variablePct).toBe(0.005)
  })

  it("computes NGN fee on noahFloor basis", () => {
    // $0.50 + 0.5% × 74.62 ≈ 0.873
    expect(
      computeNoahOfframpScheduleFee({
        currency: "NGN",
        countryCode: "NG",
        paymentMethodCategory: "Bank",
        basisAmount: 74.62,
      }),
    ).toBeCloseTo(0.873, 3)
  })

  it("resolves KES mobile money", () => {
    expect(
      resolveNoahOfframpPaymentMethodKey({
        paymentMethodCategory: "Mobile",
        mobileProvider: "MPESA",
      }),
    ).toBe("mobile_money")
    expect(
      computeNoahOfframpScheduleFee({
        currency: "KES",
        countryCode: "KE",
        paymentMethodKey: "mobile_money",
        basisAmount: 100,
      }),
    ).toBeCloseTo(1.8, 2)
  })

  it("has RWF bank and mobile rows", () => {
    expect(
      findNoahOfframpScheduleRow({
        currency: "RWF",
        countryCode: "RW",
        paymentMethodKey: "bank",
      }),
    ).not.toBeNull()
    expect(
      findNoahOfframpScheduleRow({
        currency: "RWF",
        countryCode: "RW",
        paymentMethodKey: "mobile_money",
      }),
    ).not.toBeNull()
  })
})
