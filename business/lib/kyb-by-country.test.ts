import { describe, expect, it } from "vitest"
import { getKybFields, kybFieldValue } from "./kyb-by-country"

describe("getKybFields", () => {
  it("US has registration number and EIN", () => {
    const fields = getKybFields("US")
    expect(fields.map((f) => f.id)).toEqual(["registrationNumber", "taxId"])
    expect(fields[1]?.label).toMatch(/EIN/)
  })

  it("GB has Companies House and VAT", () => {
    const fields = getKybFields("GB")
    expect(fields.map((f) => f.id)).toEqual(["registrationNumber", "taxId"])
    expect(fields[0]?.label).toMatch(/Companies House/)
    expect(fields[1]?.label).toMatch(/VAT/)
  })

  it("NG has CAC and TIN", () => {
    const fields = getKybFields("NG")
    expect(fields.map((f) => f.id)).toEqual(["registrationNumber", "taxId"])
  })

  it("EE and CA use a single national identifier", () => {
    expect(getKybFields("EE")).toHaveLength(1)
    expect(getKybFields("CA")).toHaveLength(1)
  })

  it("unknown countries default to registration + tax/VAT", () => {
    const fields = getKybFields("DE")
    expect(fields.map((f) => f.id)).toEqual(["registrationNumber", "taxId"])
  })
})

describe("kybFieldValue", () => {
  it("reads registration and tax columns", () => {
    expect(
      kybFieldValue("registrationNumber", {
        registrationNumber: " 10609372 ",
        taxId: "246398107",
      }),
    ).toBe("10609372")
    expect(
      kybFieldValue("taxId", {
        registrationNumber: "10609372",
        taxId: "246398107",
      }),
    ).toBe("246398107")
  })
})
