import { beforeAll, describe, expect, it } from "vitest"
import { isBlockedForBusiness } from "./jurisdiction-blocked-countries"
import {
  formatAddressDisplayPart,
  formatOperationalAddress,
  getOperationalAddressFormConfig,
  isOperationalAddressComplete,
  listSubdivisions,
  registerOperationalAddressCountries,
  sanitizeSubdivisionForCountry,
  validateOperationalAddress,
  validateRecipientHolderAddress,
} from "./postal-address-form"

const EXEMPLAR_CODES = ["US", "GB", "DE", "NG"] as const

const BUSINESS_ALLOWED_CODES = [
  "AC",
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TA",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "XK",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
].filter((code) => !isBlockedForBusiness(code))

const FIXTURES: Record<string, { line1: string; city: string; state?: string; postalCode?: string }> = {
  US: { line1: "1 Infinite Loop", city: "Cupertino", state: "CA", postalCode: "95014" },
  GB: { line1: "10 Downing Street", city: "London", postalCode: "SW1A 2AA" },
  DE: { line1: "Pariser Platz 1", city: "Berlin", postalCode: "10117" },
  NG: { line1: "12 Admiralty Way", city: "Lagos", state: "LA", postalCode: "101241" },
}

beforeAll(async () => {
  await registerOperationalAddressCountries(BUSINESS_ALLOWED_CODES)
}, 120_000)

describe("postal-address-form exemplars", () => {
  it("US requires state and ZIP", () => {
    const config = getOperationalAddressFormConfig("US")
    expect(config.subdivision.mode).toBe("dropdown")
    expect(config.subdivision.required).toBe(true)
    expect(config.postal.required).toBe(true)
    expect(listSubdivisions("US").length).toBeGreaterThan(40)
  })

  it("GB hides state and requires postcode", () => {
    const config = getOperationalAddressFormConfig("GB")
    expect(config.subdivision.mode).toBe("hidden")
    expect(config.postal.required).toBe(true)
    expect(config.postal.label.toLowerCase()).toContain("post")
  })

  it("DE hides state and requires postal code", () => {
    const config = getOperationalAddressFormConfig("DE")
    expect(config.subdivision.mode).toBe("hidden")
    expect(config.postal.required).toBe(true)
  })

  it("NG exposes subdivision dropdown", () => {
    const config = getOperationalAddressFormConfig("NG")
    expect(config.subdivision.mode).toBe("dropdown")
    expect(listSubdivisions("NG").length).toBeGreaterThan(10)
  })

  it("AE uses English emirate labels and city formatting", () => {
    const subdivisions = listSubdivisions("AE")
    expect(subdivisions.find((row) => row.value === "DU")?.label).toBe("Dubai")
    expect(subdivisions.some((row) => /[\u0600-\u06FF]/.test(row.label))).toBe(false)

    const formatted = formatOperationalAddress({
      line1: "Sheikh Zayed Road",
      city: "Dubai",
      state: "DU",
      countryCode: "AE",
    })
    expect(formatted).toContain("Dubai")
    expect(formatted).not.toMatch(/[\u0600-\u06FF]/)
  })

  it("rejects invalid US ZIP", () => {
    const result = validateOperationalAddress("US", {
      line1: "1 Infinite Loop",
      city: "Cupertino",
      state: "CA",
      postalCode: "BAD",
      countryCode: "US",
    })
    expect(result.valid).toBe(false)
    expect(result.errors.postalCode).toBeTruthy()
  })

  it("accepts valid exemplar addresses", () => {
    for (const code of EXEMPLAR_CODES) {
      const fixture = FIXTURES[code]
      const result = validateOperationalAddress(code, { ...fixture, countryCode: code })
      expect(result.valid, code).toBe(true)
      expect(isOperationalAddressComplete(code, { ...fixture, countryCode: code }), code).toBe(true)
    }
  })

  it("clears incompatible subdivision when switching away from dropdown country", () => {
    expect(sanitizeSubdivisionForCountry("GB", "CA")).toBe("")
    expect(sanitizeSubdivisionForCountry("US", "CA")).toBe("CA")
  })

  it("maps subdivision labels and lowercase codes to stored codes", () => {
    expect(sanitizeSubdivisionForCountry("US", "ny")).toBe("NY")
    expect(sanitizeSubdivisionForCountry("US", "New York")).toBe("NY")
    expect(sanitizeSubdivisionForCountry("US", "California")).toBe("CA")
    expect(sanitizeSubdivisionForCountry("CA", "Ontario")).toBe("ON")
  })

  it("falls back to required street/city/postal when country JSON is not loaded", () => {
    const result = validateRecipientHolderAddress("ZZ", {
      line1: "1 Main",
      city: "Town",
      postalCode: "12345",
    })
    expect(result.valid).toBe(true)
    expect(validateRecipientHolderAddress("ZZ", { line1: "", city: "Town", postalCode: "12345" }).valid).toBe(
      false,
    )
  })

  it("treats a filled address as complete before country JSON is registered", () => {
    expect(
      isOperationalAddressComplete("ZZ", {
        line1: "1 Main",
        city: "Town",
        postalCode: "12345",
        countryCode: "ZZ",
      }),
    ).toBe(true)
    expect(
      isOperationalAddressComplete("ZZ", {
        line1: "",
        city: "Town",
        postalCode: "12345",
        countryCode: "ZZ",
      }),
    ).toBe(false)
  })

  it("does not throw config lookup for an unregistered country", () => {
    expect(() => getOperationalAddressFormConfig("ZZ")).not.toThrow()
    expect(getOperationalAddressFormConfig("ZZ").countryCode).toBe("ZZ")
  })

  it("does not throw when formatting an incomplete US address", () => {
    expect(() =>
      formatOperationalAddress(
        { countryCode: "US", line1: "", city: "", state: "", postalCode: "" },
        { appendCountry: true },
      ),
    ).not.toThrow()
    expect(
      formatOperationalAddress({ countryCode: "US" }, { appendCountry: true }),
    ).toBe("")
    expect(isOperationalAddressComplete("US", { countryCode: "US" })).toBe(false)
  })

  it("formats US address with country appended", () => {
    const formatted = formatOperationalAddress(
      { ...FIXTURES.US, countryCode: "US" },
      { appendCountry: true },
    )
    expect(formatted).toContain("95014")
    expect(formatted.toUpperCase()).toContain("UNITED STATES")
  })

  it("title-cases ALL CAPS KYB-style US addresses for invoice display", () => {
    expect(formatAddressDisplayPart("SAN FRANCISCO")).toBe("San Francisco")
    expect(
      listSubdivisions("US").find((row) => row.label.toLowerCase() === "california")?.value,
    ).toBe("CA")

    const formatted = formatOperationalAddress(
      {
        line1: "584 CASTRO STREET SUITE 4092",
        city: "SAN FRANCISCO",
        state: "CALIFORNIA",
        postalCode: "94114",
        countryCode: "US",
      },
      { appendCountry: true },
    )
    expect(formatted).toBe(
      "584 Castro Street Suite 4092\nSan Francisco, CA 94114\nUnited States",
    )
  })
})

describe("postal-address-form business country sweep", () => {
  it.each(BUSINESS_ALLOWED_CODES)("configures %s without error", (code) => {
    const config = getOperationalAddressFormConfig(code)
    expect(config.countryCode).toBe(code)
    expect(config.line1.visible).toBe(true)

    const known = new Set(["line1", "city", "state", "postalCode"])
    if (config.city.required && !known.has("city")) throw new Error("unknown required city")
    if (config.subdivision.required && config.subdivision.mode === "hidden") {
      throw new Error(`subdivision required but hidden for ${code}`)
    }
    if (config.postal.required && !config.postal.visible) {
      throw new Error(`postal required but hidden for ${code}`)
    }
  })

  it.each(EXEMPLAR_CODES)("formats non-empty output for %s fixture", (code) => {
    const fixture = FIXTURES[code]
    const formatted = formatOperationalAddress({ ...fixture, countryCode: code })
    expect(formatted.trim().length).toBeGreaterThan(0)
  })
})
