import { describe, expect, it } from "vitest"
import {
  mapResidenceToLocalCurrency,
  resolveRecipientYcSendRail,
} from "./cross-border-eligibility-shared"

describe("cross-border-eligibility helpers", () => {
  it("maps residence country to local pay-in currency", () => {
    expect(mapResidenceToLocalCurrency("NG")).toBe("NGN")
    expect(mapResidenceToLocalCurrency("ke")).toBe("KES")
    expect(mapResidenceToLocalCurrency("US")).toBeNull()
  })

  it("resolves recipient YC send rail from recipient type", () => {
    expect(
      resolveRecipientYcSendRail({
        mobile_provider: "MPESA",
        bank_name: "Equity Bank",
      }),
    ).toBe("mobile_money")
    expect(
      resolveRecipientYcSendRail({
        bank_name: "Access Bank",
      }),
    ).toBe("bank_transfer")
  })
})
