import { describe, expect, it } from "vitest"
import { buildGridExternalAccountPayload, extractGridFundingSolanaAddress } from "./external-account"

describe("extractGridFundingSolanaAddress", () => {
  const sol = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"

  it("reads solanaAddress from paymentInstructions", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: { accountOrWalletInfo: { solanaAddress: sol } },
      }),
    ).toBe(sol)
  })

  it("reads depositAddress from fundingPaymentInstructions", () => {
    expect(
      extractGridFundingSolanaAddress({
        fundingPaymentInstructions: { accountOrWalletInfo: { depositAddress: sol } },
      }),
    ).toBe(sol)
  })

  it("rejects short non-address strings", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: { accountOrWalletInfo: { accountNumber: "12345" } },
      }),
    ).toBeNull()
  })

  it("reads SOLANA_WALLET address from Grid's paymentInstructions array", () => {
    expect(
      extractGridFundingSolanaAddress({
        paymentInstructions: [
          {
            accountOrWalletInfo: {
              accountType: "SOLANA_WALLET",
              address: sol,
              assetType: "USDC",
            },
          },
        ],
      }),
    ).toBe(sol)
  })

  it("prefers SOLANA_WALLET when EVM addresses come first", () => {
    expect(
      extractGridFundingSolanaAddress({
        fundingPaymentInstructions: [
          {
            accountOrWalletInfo: {
              accountType: "ETHEREUM_WALLET",
              address: "0x4665242F0be442969aBf56d449Ec2a8D2EF11830",
              assetType: "USDC",
            },
          },
          {
            accountOrWalletInfo: {
              accountType: "SOLANA_WALLET",
              address: sol,
              assetType: "USDC",
            },
          },
        ],
      }),
    ).toBe(sol)
  })
})

describe("buildGridExternalAccountPayload CAD", () => {
  it("maps routing/sort into bankCode and branchCode", () => {
    const payload = buildGridExternalAccountPayload({
      customerId: "Customer:abc",
      rail: "bank_transfer",
      recipient: {
        currency: "CAD",
        country_code: "CA",
        full_name: "Jane Doe",
        account_number: "1234567",
        bank_name: "Royal Bank of Canada",
        routing_number: "000300012",
        sort_code: "00012",
        metadata: {},
      },
    })
    expect(payload.accountInfo.accountType).toBe("CAD_ACCOUNT")
    expect(payload.accountInfo.bankCode).toBe("003")
    expect(payload.accountInfo.branchCode).toBe("00012")
    expect(payload.accountInfo.accountNumber).toBe("1234567")
  })
})
