import { describe, expect, it } from "vitest"
import { resolveTransactionRecipientDisplay } from "./transaction-recipient-display"

describe("resolveTransactionRecipientDisplay", () => {
  it("maps Easetag outbound metadata", () => {
    expect(
      resolveTransactionRecipientDisplay({
        payeeEasetag: "@Channelle",
        recipientName: "Channelle Doe",
      }),
    ).toEqual({
      fullName: "Channelle Doe",
      payeeEasetag: "channelle",
      bankName: "Easetag (@channelle)",
      accountNumber: "channelle",
      currency: "USD",
    })
  })

  it("ignores @tag-only counterparty name for Easetag display name", () => {
    expect(
      resolveTransactionRecipientDisplay({
        counterpartyName: "@channelle",
      }),
    ).toEqual({
      fullName: "",
      payeeEasetag: "channelle",
      bankName: "Easetag (@channelle)",
      accountNumber: "channelle",
      currency: "USD",
    })
  })

  it("maps fiat payout snapshot with country flag inputs", () => {
    expect(
      resolveTransactionRecipientDisplay({
        recipientSnapshot: {
          full_name: "Jane Doe",
          bank_name: "GTBank",
          account_number: "0123",
          country_code: "NG",
          currency: "NGN",
        },
      }),
    ).toMatchObject({
      fullName: "Jane Doe",
      bankName: "GTBank",
      countryCode: "NG",
      currency: "NGN",
    })
  })

  it("maps wallet send with network and address", () => {
    expect(
      resolveTransactionRecipientDisplay({
        recipientSnapshot: {
          full_name: "My Wallet",
          bank_name: "Wallet",
          account_number: "0xabc",
          currency: "USDC",
        },
        receiveNetwork: "Ethereum",
      }),
    ).toMatchObject({
      fullName: "My Wallet",
      walletNetwork: "Ethereum",
      walletAsset: "USDC",
    })
  })
})
