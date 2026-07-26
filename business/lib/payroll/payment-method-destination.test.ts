import { describe, expect, it } from "vitest"
import {
  payrollDetailsForReceivingMethodForm,
  payrollDetailsToPayoutRecipient,
} from "./payment-method-destination"

describe("payrollDetailsToPayoutRecipient", () => {
  it("maps Payroll-owned bank details into the payout contract", () => {
    expect(
      payrollDetailsToPayoutRecipient("bank", {
        fullName: "Amina Doe",
        bankName: "Example Bank",
        accountNumber: "1234567890",
        countryCode: "NG",
        currency: "NGN",
      }),
    ).toMatchObject({
      full_name: "Amina Doe",
      bank_name: "Example Bank",
      account_number: "1234567890",
      country_code: "NG",
      currency: "NGN",
    })
  })

  it("maps mobile money and wallet details without a recipient row", () => {
    expect(
      payrollDetailsToPayoutRecipient("mobile_money", {
        fullName: "Amina Doe",
        provider: "M-PESA",
        phoneNumber: "+254700123456",
        countryCode: "KE",
        currency: "KES",
      }),
    ).toMatchObject({
      account_number: "+254700123456",
      mobile_provider: "M-PESA",
      bank_name: "Mobile Money (M-PESA)",
    })
    expect(
      payrollDetailsToPayoutRecipient("stablecoin", {
        fullName: "Amina Doe",
        walletAddress: "wallet-address",
        network: "Solana",
        asset: "USDC",
      }),
    ).toMatchObject({
      account_number: "wallet-address",
      bank_name: "Wallet (USDC/Solana)",
      currency: "USDC",
    })
  })
})

describe("payrollDetailsForReceivingMethodForm", () => {
  it("hydrates camel-case form fields from legacy database-style details", () => {
    const result = payrollDetailsForReceivingMethodForm({
      full_name: "Amina Bello",
      country_code: "ng",
      bank_name: "Access Bank",
      account_number: "0123456789",
      routing_number: "110000",
      checking_or_savings: "checking",
    })

    expect(result).toMatchObject({
      fullName: "Amina Bello",
      countryCode: "NG",
      bankName: "Access Bank",
      accountNumber: "0123456789",
      routingNumber: "110000",
      accountType: "checking",
    })
    expect(result).not.toHaveProperty("account_number")
    expect(result).not.toHaveProperty("maskedDetails")
  })
})
