import { describe, expect, it } from "vitest"
import {
  resolveBusinessDepositKyb,
  resolveBusinessLedgerPayInProvider,
} from "./business-deposit-kyb"

describe("resolveBusinessDepositKyb", () => {
  it("gates USD on Global banking when Office US pay-in is Grid", () => {
    expect(
      resolveBusinessDepositKyb({
        currency: "USD",
        officePayIn: "grid",
        gridApproved: false,
        bridgeApproved: true,
      }),
    ).toEqual({ complete: false, product: "us_banking" })
    expect(
      resolveBusinessDepositKyb({
        currency: "USD",
        officePayIn: "grid",
        gridApproved: true,
        bridgeApproved: false,
      }),
    ).toEqual({ complete: true, product: "us_banking" })
  })

  it("does not ask for Global banking on USD when Office US pay-in is Bridge", () => {
    expect(
      resolveBusinessDepositKyb({
        currency: "USD",
        officePayIn: "bridge",
        gridApproved: false,
        bridgeApproved: true,
      }),
    ).toEqual({ complete: true, product: "euro_banking" })
    expect(
      resolveBusinessDepositKyb({
        currency: "USD",
        officePayIn: "bridge",
        gridApproved: true,
        bridgeApproved: false,
      }),
    ).toEqual({ complete: false, product: "euro_banking" })
  })

  it("gates EUR on More accounts even when Global banking is approved", () => {
    expect(
      resolveBusinessDepositKyb({
        currency: "EUR",
        officePayIn: "bridge",
        gridApproved: true,
        bridgeApproved: false,
      }),
    ).toEqual({ complete: false, product: "euro_banking" })
    expect(
      resolveBusinessDepositKyb({
        currency: "EUR",
        officePayIn: "bridge",
        gridApproved: false,
        bridgeApproved: true,
      }),
    ).toEqual({ complete: true, product: "euro_banking" })
  })
})

describe("resolveBusinessLedgerPayInProvider", () => {
  it("defaults USD to Grid and EUR to Bridge", () => {
    expect(resolveBusinessLedgerPayInProvider([], "USD")).toBe("grid")
    expect(resolveBusinessLedgerPayInProvider([], "EUR")).toBe("bridge")
  })

  it("reads Office US pay-in from the US:USD bank row", () => {
    expect(
      resolveBusinessLedgerPayInProvider(
        [
          {
            country_code: "US",
            currency_code: "USD",
            rail: "bank_transfer",
            metadata: { pay_in_provider: "bridge", bridge_receive_enabled: true },
          },
        ],
        "USD",
      ),
    ).toBe("bridge")
  })
})
