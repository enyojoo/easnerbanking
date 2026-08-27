import { describe, expect, it } from "vitest"
import { isGridBalancePayoutCorridor } from "./payout-corridor"
import {
  resolveCorridorRecipientOptions,
  resolveGridBankName,
  resolveGridCorridorSchema,
  resolveGridStaticCorridorSchema,
  isBankNameAllowedForCorridor,
  validateGridRecipientForCorridor,
  mapCadRoutingToGridMetadata,
  listGridStaticBankCorridorPairs,
  gridStaticSchemaSupportsRail,
} from "./yc-recipient-schema"

describe("resolveGridCorridorSchema", () => {
  it("uses static Grid API schema when DB has generic placeholder", () => {
    const schema = resolveGridCorridorSchema({
      countryCode: "AE",
      currencyCode: "AED",
      fieldsSchema: {
        grid: {
          status: "ready",
          channel_type: "bank",
          note: "Generic Grid bank schema for AE/AED",
        },
      },
    })
    expect(schema?.account_number_label).toBe("IBAN")
    expect(schema?.note).toContain("AED_ACCOUNT")
  })

  it("returns US USD ACH static schema", () => {
    const schema = resolveGridStaticCorridorSchema("US", "USD")
    expect(schema?.channel_type).toBe("bank")
    expect(schema?.note).toContain("USD_ACCOUNT")
  })

  it("lists US USD among static Grid bank corridors", () => {
    expect(listGridStaticBankCorridorPairs()).toEqual(
      expect.arrayContaining([{ countryCode: "US", currencyCode: "USD" }]),
    )
    expect(gridStaticSchemaSupportsRail("US", "USD", "bank_transfer")).toBe(true)
    expect(gridStaticSchemaSupportsRail("US", "USD", "mobile_money")).toBe(false)
  })

  it("validates US ACH routing number", () => {
    const ok = validateGridRecipientForCorridor({
      countryCode: "US",
      currencyCode: "USD",
      row: {
        currency: "USD",
        full_name: "Jane Doe",
        account_number: "123456789",
        routing_number: "021000021",
      },
    })
    expect(ok).toEqual({ ok: true })
    const missing = validateGridRecipientForCorridor({
      countryCode: "US",
      currencyCode: "USD",
      row: {
        currency: "USD",
        full_name: "Jane Doe",
        account_number: "123456789",
      },
    })
    expect(missing).toEqual({
      ok: false,
      message: "US bank recipient requires a 9-digit routing number.",
    })
  })

  it("returns CAD bank/branch extra fields from static schema", () => {
    const schema = resolveGridStaticCorridorSchema("CA", "CAD")
    expect(schema?.extra_fields?.map((f) => f.key)).toEqual(["bank_code", "branch_code"])
  })

  it("validates CAD bank_code and branch_code extras", () => {
    const ok = validateGridRecipientForCorridor({
      countryCode: "CA",
      currencyCode: "CAD",
      row: {
        currency: "CAD",
        full_name: "Jane Doe",
        account_number: "1234567",
        bank_name: "RBC",
        metadata: { bank_code: "003", branch_code: "00012" },
      },
    })
    expect(ok).toEqual({ ok: true })
    const missing = validateGridRecipientForCorridor({
      countryCode: "CA",
      currencyCode: "CAD",
      row: {
        currency: "CAD",
        full_name: "Jane Doe",
        account_number: "1234567",
        bank_name: "RBC",
        metadata: {},
      },
    })
    expect(missing.ok).toBe(false)
  })

  it("validates IN IFSC extra field", () => {
    const ok = validateGridRecipientForCorridor({
      countryCode: "IN",
      currencyCode: "INR",
      row: {
        currency: "INR",
        full_name: "Priya",
        account_number: "1234567890",
        bank_name: "HDFC Bank",
        metadata: { ifsc: "HDFC0001234" },
      },
    })
    expect(ok).toEqual({ ok: true })
    const missing = validateGridRecipientForCorridor({
      countryCode: "IN",
      currencyCode: "INR",
      row: {
        currency: "INR",
        full_name: "Priya",
        account_number: "1234567890",
        bank_name: "HDFC Bank",
        metadata: {},
      },
    })
    expect(missing.ok).toBe(false)
  })

  it("validates Brazil Pix key format and taxId", () => {
    expect(
      validateGridRecipientForCorridor({
        countryCode: "BR",
        currencyCode: "BRL",
        row: {
          currency: "BRL",
          full_name: "Joao",
          account_number: "12345678901",
          metadata: { pix_key_type: "CPF" },
        },
      }),
    ).toEqual({ ok: true })
    expect(
      validateGridRecipientForCorridor({
        countryCode: "BR",
        currencyCode: "BRL",
        row: {
          currency: "BRL",
          full_name: "Joao",
          account_number: "joao@example.com",
          metadata: { pix_key_type: "EMAIL", tax_id: "12345678901" },
        },
      }),
    ).toEqual({ ok: true })
    const missingTax = validateGridRecipientForCorridor({
      countryCode: "BR",
      currencyCode: "BRL",
      row: {
        currency: "BRL",
        full_name: "Joao",
        account_number: "joao@example.com",
        metadata: { pix_key_type: "EMAIL" },
      },
    })
    expect(missingTax.ok).toBe(false)
    if (!missingTax.ok) expect(missingTax.message).toMatch(/tax ID/)
  })

  it("returns momo providers for UG when discoveries are absent", () => {
    const schema = resolveGridStaticCorridorSchema("UG", "UGX")
    expect(schema?.channel_type).toBe("momo")
    expect(schema?.momo_provider_enum?.map((e) => e.label)).toEqual(["Airtel Money", "MTN"])
  })
})

describe("resolveCorridorRecipientOptions", () => {
  it("unions bank enums from Noah, YC, and Grid schemas when no primary is set", () => {
    const options = resolveCorridorRecipientOptions({
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      fieldsSchema: {
        noah: { amount_field_mode: "note_optional_only", bank_enum: ["GTBank"] },
        yellowcard: { status: "ready", channel_type: "bank", bank_enum: ["Access Bank"] },
        grid: { status: "ready", channel_type: "bank", bank_enum: ["Zenith Bank"] },
      },
    })
    expect(options.bankOptions).toEqual(["GTBank", "Access Bank", "Zenith Bank"])
  })

  it("scopes bank enums to Office primary payout provider", () => {
    const options = resolveCorridorRecipientOptions({
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      payoutProvider: "yellowcard",
      fieldsSchema: {
        noah: { amount_field_mode: "note_optional_only", bank_enum: ["GTBank"] },
        yellowcard: { status: "ready", channel_type: "bank", bank_enum: ["Access Bank"] },
        grid: { status: "ready", channel_type: "bank", bank_enum: ["Zenith Bank"] },
      },
    })
    expect(options.bankOptions).toEqual(["Access Bank"])
  })

  it("unions mobile provider labels from providers column and grid schema", () => {
    const options = resolveCorridorRecipientOptions({
      countryCode: "KE",
      currencyCode: "KES",
      rail: "mobile_money",
      providers: ["M-PESA"],
      fieldsSchema: {
        grid: {
          status: "ready",
          channel_type: "momo",
          momo_provider_enum: [{ value: "M-Pesa", label: "M-Pesa" }, { value: "Airtel", label: "Airtel Money" }],
        },
      },
    })
    expect(options.momoOptions).toContain("M-PESA")
    expect(options.momoOptions).toContain("M-Pesa")
    expect(options.momoOptions).toContain("Airtel Money")
  })
})

describe("resolveGridBankName", () => {
  it("maps known aliases to Grid canonical names", () => {
    expect(resolveGridBankName("M-PESA")).toBe("M-Pesa")
    expect(resolveGridBankName("Kuda")).toBe("Kuda Microfinance Bank")
  })

  it("fuzzy-matches against corridor bank_enum when provided", () => {
    expect(resolveGridBankName("GTBank", ["GT Bank", "Access Bank"])).toBe("GT Bank")
  })
})

describe("mapCadRoutingToGridMetadata", () => {
  it("parses CPA 9-digit routing into bank_code and branch_code", () => {
    expect(
      mapCadRoutingToGridMetadata({
        routingNumber: "000300012",
        sortCode: "",
      }),
    ).toEqual({ bank_code: "003", branch_code: "00012" })
  })

  it("uses 3-digit routing and 5-digit sort as bank/branch", () => {
    expect(
      mapCadRoutingToGridMetadata({
        routingNumber: "003",
        sortCode: "00012",
      }),
    ).toEqual({ bank_code: "003", branch_code: "00012" })
  })
})

describe("isGridBalancePayoutCorridor", () => {
  it("returns true when Grid is primary payout provider", () => {
    expect(
      isGridBalancePayoutCorridor({
        provider_routing: [{ provider: "grid", priority: 1, settlement_asset: "USDC" }],
        metadata: { grid_send_enabled: true },
      }),
    ).toBe(true)
  })
})

describe("isBankNameAllowedForCorridor", () => {
  it("allows Noah-style bank names when they fuzzy-match Grid bank_enum", () => {
    const options = resolveCorridorRecipientOptions({
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      fieldsSchema: {
        grid: {
          status: "ready",
          channel_type: "bank",
          bank_enum: ["Kuda Microfinance Bank", "GT Bank"],
        },
      },
    })
    expect(isBankNameAllowedForCorridor("Kuda", options)).toBe(true)
    expect(isBankNameAllowedForCorridor("GTBank", options)).toBe(true)
    expect(isBankNameAllowedForCorridor("Made Up Bank", options)).toBe(false)
  })
})
