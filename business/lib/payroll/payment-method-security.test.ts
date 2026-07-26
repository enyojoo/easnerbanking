import { describe, expect, it } from "vitest"
import { maskPayrollMethodDetails } from "./payment-method-security"

describe("maskPayrollMethodDetails", () => {
  it("keeps non-sensitive bank and mobile destination metadata for edit defaults", () => {
    expect(maskPayrollMethodDetails("bank", {
      bankName: "Example Bank",
      accountNumber: "1234567890",
      countryCode: "NG",
      currency: "NGN",
    })).toMatchObject({
      account: "•••• 7890",
      countryCode: "NG",
      currency: "NGN",
    })
    expect(maskPayrollMethodDetails("mobile_money", {
      provider: "M-PESA",
      phoneNumber: "+254700123456",
      countryCode: "KE",
      currency: "KES",
    })).toMatchObject({
      phone: "•••• 3456",
      countryCode: "KE",
      currency: "KES",
    })
  })

  it("keeps only the wallet asset and masked destination metadata", () => {
    expect(maskPayrollMethodDetails("stablecoin", {
      asset: "USDC",
      network: "Solana",
      walletAddress: "wallet-address-1234",
    })).toEqual({
      network: "Solana",
      wallet: "•••• 1234",
      asset: "USDC",
    })
  })
})
