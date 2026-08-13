import { describe, expect, it } from "vitest"
import { mapResidenceToLocalPayInCurrency } from "./yc-fund-balance-errors"

describe("mapResidenceToLocalPayInCurrency", () => {
  it("maps Grid receive-live countries", () => {
    expect(mapResidenceToLocalPayInCurrency("EG")).toBe("EGP")
    expect(mapResidenceToLocalPayInCurrency("VN")).toBe("VND")
    expect(mapResidenceToLocalPayInCurrency("PH")).toBe("PHP")
    expect(mapResidenceToLocalPayInCurrency("AE")).toBe("AED")
    expect(mapResidenceToLocalPayInCurrency("CA")).toBe("CAD")
    expect(mapResidenceToLocalPayInCurrency("SV")).toBe("USD")
  })

  it("maps existing YC countries", () => {
    expect(mapResidenceToLocalPayInCurrency("UG")).toBe("UGX")
    expect(mapResidenceToLocalPayInCurrency("xx")).toBeNull()
  })
})
