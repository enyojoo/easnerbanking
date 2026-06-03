import { describe, expect, it } from "vitest"
import {
  bankEnumFromFormSchema,
  labelForIdentifierChannel,
  labelFromNoahIssuer,
  mobileProviderLabelsFromSellItems,
  mobileProviderPrepareSubstrings,
  normalizeFormSchemaHints,
} from "../form-schema-hints"
import { findIdentifierSellChannel } from "../payout-prepare"

describe("bankEnumFromFormSchema", () => {
  it("reads Bank enum from standard Noah properties nesting", () => {
    const schema = {
      required: ["BankDetails", "PaymentPurpose"],
      properties: {
        BankDetails: {
          type: "object",
          properties: {
            Bank: { type: "string", enum: ["Access Bank", "GTBank"] },
            AccountNumber: { type: "string" },
          },
        },
        PaymentPurpose: { type: "string" },
      },
    }
    expect(bankEnumFromFormSchema(schema)).toEqual(["Access Bank", "GTBank"])
  })
})

describe("mobileProviderLabelsFromSellItems", () => {
  it("returns M-PESA only for Kenya when Noah has one Identifier channel", () => {
    const labels = mobileProviderLabelsFromSellItems(
      [
        {
          PaymentMethodCategory: "Identifier",
          PaymentMethodType: "IdentifierMobileMoney",
          Issuer: "MPS",
          ID: "ch-ke",
        },
        {
          PaymentMethodCategory: "Bank",
          PaymentMethodType: "BankLocal",
          ID: "ch-bank",
        },
      ],
      "KE",
    )
    expect(labels).toEqual(["M-PESA"])
  })

  it("maps Kenya MPS issuer to M-PESA", () => {
    expect(labelFromNoahIssuer("MPS", "KE")).toBe("M-PESA")
    expect(labelFromNoahIssuer("MPS", "RW")).toBe("Airtel Money")
  })

  it("maps Airtel from payment method type", () => {
    expect(
      labelForIdentifierChannel({ PaymentMethodType: "IdentifierAirtelMoney" }, "KE"),
    ).toBe("Airtel Money")
  })

  it("maps Ghana mobile issuers from Noah Issuer field", () => {
    const labels = mobileProviderLabelsFromSellItems(
      [
        { PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "MTN" },
        { PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "VODAFONE" },
        { PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "AIRTELTIGO" },
      ],
      "GH",
    )
    expect(labels).toEqual(["AirtelTigo", "MTN Ghana", "Vodafone"])
  })

  it("maps Rwanda mobile issuers from Noah Issuer field", () => {
    const labels = mobileProviderLabelsFromSellItems(
      [
        { PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "MTN" },
        { PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "MPS" },
      ],
      "RW",
    )
    expect(labels).toEqual(["Airtel Money", "MTN Rwanda"])
  })

  it("resolves prepare substrings from issuer-backed labels", () => {
    expect(mobileProviderPrepareSubstrings("AirtelTigo")).toEqual(["airteltigo", "airtel"])
    expect(mobileProviderPrepareSubstrings("Vodafone")).toEqual(["vodafone"])
    expect(mobileProviderPrepareSubstrings("MTN Ghana")).toEqual(["mtn", "momo"])
    expect(labelFromNoahIssuer("MTN", "GH")).toBe("MTN Ghana")
    expect(labelFromNoahIssuer("MTN", "RW")).toBe("MTN Rwanda")
    expect(labelFromNoahIssuer("MPS", "RW")).toBe("Airtel Money")
  })
})

describe("findIdentifierSellChannel issuer matching", () => {
  const ghMobile = [
    { ID: "mtn", PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "MTN" },
    { ID: "vod", PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "VODAFONE" },
    { ID: "at", PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney", Issuer: "AIRTELTIGO" },
  ]

  it("picks channel by provider label via Issuer", () => {
    const picked = findIdentifierSellChannel(ghMobile, {
      paymentMethodSubstrings: mobileProviderPrepareSubstrings("Vodafone"),
    })
    expect(picked?.channelId).toBe("vod")
  })

  it("picks MTN Ghana channel from disambiguated label", () => {
    const picked = findIdentifierSellChannel(ghMobile, {
      paymentMethodSubstrings: mobileProviderPrepareSubstrings("MTN Ghana"),
    })
    expect(picked?.channelId).toBe("mtn")
  })
})

describe("normalizeFormSchemaHints", () => {
  it("includes bank_enum on BankLocal channels", () => {
    const hints = normalizeFormSchemaHints({
      ID: "ch-1",
      PaymentMethodType: "BankLocal",
      Country: "NG",
      FormSchema: {
        required: ["BankDetails"],
        properties: {
          BankDetails: {
            properties: {
              Bank: { enum: ["GTBank"] },
            },
          },
        },
      },
    })
    expect(hints.bank_enum).toEqual(["GTBank"])
  })

  it("treats US ACH Reference as optional on the amount screen", () => {
    const hints = normalizeFormSchemaHints({
      ID: "ch-us",
      PaymentMethodType: "BankAch",
      Country: "US",
      FiatCurrency: "USD",
      FormSchema: {
        required: ["BankDetails", "PaymentPurpose", "Reference"],
        properties: {
          BankDetails: { type: "object" },
          PaymentPurpose: { type: "string" },
          Reference: { type: "string", title: "Reference" },
        },
      },
    })
    expect(hints.reference_required).toBe(false)
    expect(hints.reference_optional).toBe(true)
    expect(hints.amount_field_mode).toBe("note_optional_only")
  })

  it("keeps EUR SEPA reference required when in schema", () => {
    const hints = normalizeFormSchemaHints({
      ID: "ch-eur",
      PaymentMethodType: "BankSepa",
      Country: "DE",
      FiatCurrency: "EUR",
      FormSchema: {
        required: ["BankDetails", "Reference"],
        properties: {
          BankDetails: { type: "object" },
          Reference: { type: "string" },
        },
      },
    })
    expect(hints.reference_required).toBe(true)
    expect(hints.amount_field_mode).toBe("note")
  })
})
