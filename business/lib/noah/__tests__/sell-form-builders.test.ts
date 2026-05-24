import { describe, expect, it } from "vitest"
import {
  buildAccountHolderName,
  buildBankLocalSellForm,
  buildCaBankLocalSellForm,
  buildEurSepaSellForm,
  buildGbBankLocalSellForm,
  buildIdentifierSellForm,
  buildUsBankSellForm,
  isNoahUsAchChannel,
} from "../sell-form-builders"

describe("buildAccountHolderName", () => {
  it("splits individual names", () => {
    expect(buildAccountHolderName({ fullName: "Ada Lovelace" })).toEqual({
      AccountHolderType: "Individual",
      Name: { FirstName: "Ada", LastName: "Lovelace" },
    })
  })
})

describe("buildEurSepaSellForm", () => {
  it("includes Reference and strips IBAN spaces", () => {
    const form = buildEurSepaSellForm({
      iban: "DE89 3704 0044 0532 0130 00",
      fullName: "Test User",
      reference: "Invoice 42",
    })
    expect(form.BankDetails).toEqual({ AccountNumber: "DE89370400440532013000" })
    expect(form.Reference).toBe("Invoice 42")
    expect(form).not.toHaveProperty("AccountType")
  })
})

describe("buildUsBankSellForm", () => {
  it("includes AccountType on ACH and optional Reference", () => {
    const form = buildUsBankSellForm({
      accountHolderAddress: { address: "1 Main", city: "NYC", state: "NY", postalCode: "10001" },
      accountNumber: "123",
      routingNumber: "021000021",
      fullName: "Jane Doe",
      accountType: "Checking",
      achRail: true,
      reference: "Rent",
    })
    expect((form.BankDetails as Record<string, unknown>).AccountType).toBe("Checking")
    expect(form.Reference).toBe("Rent")
  })

  it("omits AccountType on Fedwire", () => {
    const form = buildUsBankSellForm({
      accountHolderAddress: { address: "1 Main", city: "NYC", state: "NY", postalCode: "10001" },
      accountNumber: "123",
      routingNumber: "021000021",
      fullName: "Jane Doe",
      achRail: false,
    })
    expect((form.BankDetails as Record<string, unknown>).AccountType).toBeUndefined()
  })
})

describe("buildIdentifierSellForm", () => {
  it("uses nested MobileMoneyDetails when schema requires it", () => {
    const schema = {
      required: ["MobileMoneyDetails", "PaymentPurpose"],
      properties: {
        MobileMoneyDetails: { type: "object" },
        PaymentPurpose: { type: "string" },
      },
    }
    const form = buildIdentifierSellForm(schema, {
      phone: "+254712345678",
      fullName: "John Doe",
    })
    expect(form.MobileMoneyDetails).toEqual({ MobileNumber: "+254712345678" })
    expect(form.PaymentPurpose).toBe("personal transfer")
  })
})

describe("buildBankLocalSellForm", () => {
  const ngSchema = {
    required: ["BankDetails", "PaymentPurpose"],
    properties: {
      BankDetails: {
        properties: {
          Bank: { enum: ["Access Bank", "GTBank"] },
          AccountNumber: { type: "string" },
        },
      },
      PaymentPurpose: { type: "string" },
    },
  }

  it("uses Bank enum value", () => {
    const form = buildBankLocalSellForm(ngSchema, {
      accountNumber: "0123456789",
      bankName: "GTBank",
      fullName: "Jane Doe",
    })
    expect((form.BankDetails as Record<string, unknown>).Bank).toBe("GTBank")
    expect(form.AccountHolderName).toBeDefined()
  })
})

describe("buildCaBankLocalSellForm", () => {
  it("includes branch, bank name, and holder address", () => {
    const form = buildCaBankLocalSellForm({
      accountNumber: "1234567",
      routingNumber: "000123456",
      branchCode: "00123",
      bankName: "Royal Bank",
      fullName: "Jane Doe",
      address: { address: "1 Main", city: "Toronto", state: "ON", postalCode: "M5V1A1" },
      paymentPurpose: "personal transfer",
    })
    expect((form.BankDetails as Record<string, unknown>).BranchCode).toBe("00123")
    expect(form.AccountHolderAddress).toBeDefined()
    expect(form.PaymentPurpose).toBe("personal transfer")
  })
})

describe("buildGbBankLocalSellForm", () => {
  it("maps sort code and bank name", () => {
    const form = buildGbBankLocalSellForm({
      accountNumber: "12345678",
      sortCode: "12-34-56",
      bankName: "Barclays",
      fullName: "John Smith",
    })
    expect((form.BankDetails as Record<string, unknown>).SortCode).toBe("123456")
    expect((form.BankDetails as Record<string, unknown>).BankName).toBe("Barclays")
  })
})

describe("buildBankLocalSellForm ZA", () => {
  const zaSchema = {
    required: ["BankDetails", "Email", "PhoneNumber", "AccountHolderAddress", "AccountHolderName"],
    properties: {
      BankDetails: { properties: { Bank: { enum: ["FNB"] }, AccountNumber: {} } },
      Email: {},
      PhoneNumber: {},
      AccountHolderAddress: {},
      AccountHolderName: {},
    },
  }

  it("includes email phone and address for ZA", () => {
    const form = buildBankLocalSellForm(zaSchema, {
      accountNumber: "123",
      bankName: "FNB",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+27123456789",
      address: { address: "1 Main", city: "Cape Town", state: "WC", postalCode: "8001" },
    })
    expect(form.Email).toBe("jane@example.com")
    expect(form.PhoneNumber).toBe("+27123456789")
    expect(form.AccountHolderAddress).toBeDefined()
    expect(form.AccountHolderName).toBeDefined()
  })
})

describe("isNoahUsAchChannel", () => {
  it("detects ACH vs Fedwire", () => {
    expect(isNoahUsAchChannel("BankAch")).toBe(true)
    expect(isNoahUsAchChannel("BankFedwire")).toBe(false)
  })
})
