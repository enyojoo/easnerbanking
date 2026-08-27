import { describe, expect, it } from "vitest"
import { payrollMethodDbPayload, sendDestinationFromRow } from "./send-destination"

describe("sendDestinationFromRow", () => {
  it("uses a neutral Payroll reference and normalized bank fields", () => {
    const row = sendDestinationFromRow({
      id: "method-1",
      type: "bank",
      full_name: "Amina Doe",
      country_code: "NG",
      currency: "ngn",
      account_number: "0123456789",
      bank_name: "Example Bank",
      metadata: { providerCode: "123" },
    }, "payroll_method")

    expect(row).toMatchObject({
      id: "method-1",
      destinationRef: "payroll_method:method-1",
      type: "bank",
      currency: "NGN",
      account_number: "0123456789",
    })
  })

  it("preserves US RTP and FedNow transfer types", () => {
    expect(
      sendDestinationFromRow(
        {
          id: "us-rtp",
          type: "bank",
          full_name: "Jane Doe",
          country_code: "US",
          currency: "USD",
          transfer_type: "RTP",
        },
        "recipient",
      ).transfer_type,
    ).toBe("RTP")
    expect(
      sendDestinationFromRow(
        {
          id: "us-fednow",
          type: "bank",
          full_name: "Jane Doe",
          country_code: "US",
          currency: "USD",
          transfer_type: "FEDNOW",
        },
        "recipient",
      ).transfer_type,
    ).toBe("FEDNOW")
  })

  it("maps stablecoin methods into wallet destinations", () => {
    const row = sendDestinationFromRow({
      id: "method-wallet",
      type: "stablecoin",
      full_name: "Amina Doe",
      currency: "USDC",
      account_number: "0xabc",
      wallet_network: "base",
    }, "payroll_method")

    expect(row).toMatchObject({
      destinationRef: "payroll_method:method-wallet",
      type: "wallet",
      account_number: "0xabc",
      wallet_network: "base",
    })
  })
})

describe("payrollMethodDbPayload", () => {
  it("stores mobile-money fields directly on the Payroll method", () => {
    expect(payrollMethodDbPayload("mobile_money", {
      fullName: "Amina Doe",
      countryCode: "GH",
      currency: "GHS",
      phoneNumber: "+233200000000",
      provider: "MTN",
    })).toMatchObject({
      full_name: "Amina Doe",
      country_code: "GH",
      currency: "GHS",
      account_number: "+233200000000",
      phone_number: "+233200000000",
      mobile_provider: "MTN",
    })
  })

  it("stores wallet asset, network, and address without a recipient identifier", () => {
    const payload = payrollMethodDbPayload("stablecoin", {
      fullName: "Amina Doe",
      asset: "USDC",
      network: "base",
      walletAddress: "0xabc",
    })
    expect(payload).toMatchObject({
      currency: "USDC",
      account_number: "0xabc",
      wallet_network: "base",
    })
    expect(payload).not.toHaveProperty("recipient_id")
    expect(payload).not.toHaveProperty("provider_recipient_id")
  })
})
