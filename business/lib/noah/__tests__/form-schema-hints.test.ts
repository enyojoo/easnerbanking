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
})
