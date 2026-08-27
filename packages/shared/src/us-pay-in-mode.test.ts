import { describe, expect, it } from "vitest"
import {
  applyUsPayInModeToMetadata,
  corridorOffersCrossBorder,
  resolveUsPayInMode,
  resolveUsPayInModeFromCatalog,
  resolveUsPayInModeFromCorridor,
  usPayInAllowsExpress,
  usPayInAllowsVa,
  US_PAY_IN_MODE_OPTIONS,
} from "./us-pay-in-mode"

describe("Office US vs other countries", () => {
  it("US Pay-in options are VA modes, not Grid/YC/Noah", () => {
    expect(US_PAY_IN_MODE_OPTIONS.map((o) => o.value)).toEqual(["va", "va_express"])
    expect(US_PAY_IN_MODE_OPTIONS.map((o) => o.label)).toEqual(["VA only", "VA & Express"])
  })

  it("US Cross-border is not offered; NG still is", () => {
    expect(corridorOffersCrossBorder("US", "USD")).toBe(false)
    expect(corridorOffersCrossBorder("NG", "NGN")).toBe(true)
  })
})

describe("corridorOffersCrossBorder", () => {
  it("is false for US USD", () => {
    expect(corridorOffersCrossBorder("US", "USD")).toBe(false)
    expect(corridorOffersCrossBorder("us", "usd")).toBe(false)
  })

  it("is true for other corridors", () => {
    expect(corridorOffersCrossBorder("NG", "NGN")).toBe(true)
    expect(corridorOffersCrossBorder("KE", "KES")).toBe(true)
    expect(corridorOffersCrossBorder("DE", "EUR")).toBe(true)
  })
})

describe("resolveUsPayInMode", () => {
  it("uses explicit pay_in_mode", () => {
    expect(resolveUsPayInMode({ pay_in_mode: "va" })).toBe("va")
    expect(resolveUsPayInMode({ pay_in_mode: "va_express" })).toBe("va_express")
    expect(resolveUsPayInMode({ pay_in_mode: "disabled" })).toBe("disabled")
  })

  it("infers VA & Express from legacy receive flags", () => {
    expect(resolveUsPayInMode({ grid_receive_enabled: true })).toBe("va_express")
    expect(resolveUsPayInMode({ pay_in_provider: "noah" })).toBe("va_express")
    expect(resolveUsPayInMode({})).toBe("disabled")
  })
})

describe("resolveUsPayInModeFromCorridor", () => {
  it("defaults to VA & Express when the catalog row is missing", () => {
    expect(resolveUsPayInModeFromCorridor(null)).toBe("va_express")
  })

  it("treats a Live-off row as disabled", () => {
    expect(resolveUsPayInModeFromCorridor({ enabled: false, metadata: { pay_in_mode: "va_express" } })).toBe(
      "disabled",
    )
  })
})

describe("resolveUsPayInModeFromCatalog", () => {
  it("keeps VA & Express until the catalog has loaded", () => {
    expect(resolveUsPayInModeFromCatalog([], false)).toBe("va_express")
  })

  it("is Disable when the loaded catalog has no US row", () => {
    expect(
      resolveUsPayInModeFromCatalog(
        [{ country_code: "NG", currency_code: "NGN", rail: "bank_transfer", metadata: {} }],
        true,
      ),
    ).toBe("disabled")
  })

  it("reads the US bank row mode", () => {
    expect(
      resolveUsPayInModeFromCatalog(
        [{ country_code: "US", currency_code: "USD", rail: "bank_transfer", metadata: { pay_in_mode: "va" } }],
        true,
      ),
    ).toBe("va")
  })
})

describe("usPayInAllowsVa / Express", () => {
  it("Disable hides both", () => {
    expect(usPayInAllowsVa("disabled")).toBe(false)
    expect(usPayInAllowsExpress("disabled")).toBe(false)
  })

  it("VA only hides Express", () => {
    expect(usPayInAllowsVa("va")).toBe(true)
    expect(usPayInAllowsExpress("va")).toBe(false)
  })

  it("VA & Express allows both", () => {
    expect(usPayInAllowsVa("va_express")).toBe(true)
    expect(usPayInAllowsExpress("va_express")).toBe(true)
  })
})

describe("applyUsPayInModeToMetadata", () => {
  it("enables both VA providers and Stripe on VA & Express", () => {
    const next = applyUsPayInModeToMetadata(
      { pay_in_provider: "grid", cross_border_enabled: true, cross_border_provider: "grid" },
      "va_express",
    )
    expect(next.pay_in_mode).toBe("va_express")
    expect(next.pay_in_provider).toBeUndefined()
    expect(next.grid_receive_enabled).toBe(true)
    expect(next.noah_receive_enabled).toBe(true)
    expect(next.stripe_express_enabled).toBe(true)
    expect(next.cross_border_enabled).toBe(false)
    expect(next.cross_border_provider).toBeUndefined()
  })

  it("VA only enables both VA flags and turns Express off", () => {
    const next = applyUsPayInModeToMetadata({}, "va")
    expect(next.pay_in_mode).toBe("va")
    expect(next.grid_receive_enabled).toBe(true)
    expect(next.noah_receive_enabled).toBe(true)
    expect(next.stripe_express_enabled).toBe(false)
  })

  it("does not enable Yellowcard for US", () => {
    const next = applyUsPayInModeToMetadata({}, "va_express")
    expect(next.yc_receive_enabled).toBe(false)
  })

  it("clears receive flags on Disable", () => {
    const next = applyUsPayInModeToMetadata(
      { pay_in_mode: "va_express", grid_receive_enabled: true, stripe_express_enabled: true },
      "disabled",
    )
    expect(next.pay_in_mode).toBeUndefined()
    expect(next.grid_receive_enabled).toBe(false)
    expect(next.noah_receive_enabled).toBe(false)
    expect(next.stripe_express_enabled).toBe(false)
  })
})
