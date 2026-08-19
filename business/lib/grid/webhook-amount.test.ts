import { describe, expect, it } from "vitest"
import {
  extractGridOnChainTxHash,
  gridMoneyToMajor,
  resolveGridVaInboundWalletCredit,
} from "./webhook-amount"
import { isGridFundBalanceCustodyDisabled } from "./fund-balance-guard"

describe("gridMoneyToMajor", () => {
  it("converts minor units when decimals are present", () => {
    expect(
      gridMoneyToMajor({
        amount: 12550,
        currency: { code: "USD", decimals: 2 },
      }),
    ).toEqual({ amount: 125.5, currency: "USD" })
  })
})

describe("resolveGridVaInboundWalletCredit", () => {
  it("prefers USD received amount for wallet credit", () => {
    expect(
      resolveGridVaInboundWalletCredit({
        receivedAmount: { amount: 10000, currency: { code: "USD", decimals: 2 } },
      }),
    ).toEqual({
      amount: 100,
      ledgerCurrency: "USD",
      fiatAmount: 100,
      fiatCurrency: "USD",
    })
  })
})

describe("extractGridOnChainTxHash", () => {
  it("reads destination.onChainTransaction.transactionHash", () => {
    expect(
      extractGridOnChainTxHash({
        destination: { onChainTransaction: { transactionHash: "solanaSig" } },
      }),
    ).toBe("solanaSig")
  })
})

describe("isGridFundBalanceCustodyDisabled", () => {
  it("is enabled by default", () => {
    const prev = process.env.GRID_FUND_BALANCE_DISABLED
    delete process.env.GRID_FUND_BALANCE_DISABLED
    expect(isGridFundBalanceCustodyDisabled()).toBe(false)
    process.env.GRID_FUND_BALANCE_DISABLED = prev
  })

  it("can be disabled explicitly", () => {
    const prev = process.env.GRID_FUND_BALANCE_DISABLED
    process.env.GRID_FUND_BALANCE_DISABLED = "true"
    expect(isGridFundBalanceCustodyDisabled()).toBe(true)
    process.env.GRID_FUND_BALANCE_DISABLED = prev
  })
})
