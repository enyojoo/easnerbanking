import { describe, expect, it } from "vitest"
import { extractGridFundingSolanaAddress } from "./external-account"

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
})
