import { describe, expect, it } from "vitest"
import {
  bankEnumFromFormSchema,
  labelForIdentifierChannel,
  mobileProviderLabelsFromSellItems,
  normalizeFormSchemaHints,
} from "../form-schema-hints"

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

  it("maps Airtel from payment method type", () => {
    expect(
      labelForIdentifierChannel({ PaymentMethodType: "IdentifierAirtelMoney" }, "KE"),
    ).toBe("Airtel Money")
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
