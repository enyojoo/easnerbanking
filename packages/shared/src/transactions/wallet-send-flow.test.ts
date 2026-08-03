import { describe, expect, it } from "vitest"
import {
  abbreviateBlockchainNetwork,
  formatWalletSendTransferMethod,
  isWalletSendOutRow,
  walletSendListProductLabel,
  walletSendUserFacingDisplayCurrency,
} from "./wallet-send-flow"
import { resolveWalletSendListDisplay } from "./map-ledger-list-row"

describe("wallet-send-flow", () => {
  it("detects wallet send out rows", () => {
    expect(
      isWalletSendOutRow({
        direction: "out",
        metadata: { activity_type: "wallet_send" },
      }),
    ).toBe(true)
    expect(
      isWalletSendOutRow({
        direction: "in",
        metadata: { activity_type: "wallet_send" },
      }),
    ).toBe(false)
  })

  it("formats transfer method with abbreviated network", () => {
    expect(formatWalletSendTransferMethod("USDC", "Solana")).toBe("USDC on SOL")
    expect(abbreviateBlockchainNetwork("ethereum")).toBe("ETH")
  })
})

describe("resolveWalletSendListDisplay", () => {
  it("uses receive amount and recipient name on the list path", () => {
    const display = resolveWalletSendListDisplay({
      direction: "out",
      amount: 1.01,
      currency: "USD",
      metadata: {
        activity_type: "wallet_send",
        receive_amount: 1,
        receive_asset: "USDC",
        counterparty_name: "External Wallet",
        payout_review: {
          receive_amount: 1,
          receive_currency: "USDC",
          total_debited: 1.01,
          send_currency: "USD",
        },
      },
    })
    expect(display).toMatchObject({
      displayAmount: 1,
      displayCurrency: "USD",
      displayDescription: "External Wallet",
      displayHeroTitle: "External Wallet",
      transactionProduct: walletSendListProductLabel(),
    })
  })

  it("maps USDC receive to USD for direct turnkey display", () => {
    expect(
      walletSendUserFacingDisplayCurrency({
        receiveCurrency: "USDC",
        sendCurrency: "USD",
        executionModel: "direct_turnkey",
      }),
    ).toBe("USD")
  })
})
