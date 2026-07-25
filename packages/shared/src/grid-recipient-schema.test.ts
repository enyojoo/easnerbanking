import { describe, expect, it } from "vitest"
import { isGridBalancePayoutCorridor } from "./payout-corridor"
import {
  resolveCorridorRecipientOptions,
  resolveGridBankName,
  isBankNameAllowedForCorridor,
} from "./yc-recipient-schema"

describe("resolveCorridorRecipientOptions", () => {
  it("unions bank enums from Noah, YC, and Grid schemas", () => {
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

describe("isGridBalancePayoutCorridor", () => {
  it("returns true when Grid is primary payout provider", () => {
    expect(
      isGridBalancePayoutCorridor({
        provider_routing: [{ provider: "grid", priority: 1, settlement_asset: "USDC" }],
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
