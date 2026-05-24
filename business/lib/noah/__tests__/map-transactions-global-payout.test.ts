import { describe, expect, it } from "vitest"
import {
  isNoahGlobalPayoutSellTx,
  pickNoahGlobalPayoutLedgerFields,
  settlementWalletCurrencyForNoahCrypto,
} from "@/lib/noah/global-payout-ledger"

describe("isNoahGlobalPayoutSellTx", () => {
  it("detects global fiat payout sell transactions", () => {
    expect(
      isNoahGlobalPayoutSellTx({
        Direction: "Out",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "5000", FiatCurrency: "NGN" },
      }),
    ).toBe(true)
  })
})

describe("pickNoahGlobalPayoutLedgerFields", () => {
  it("maps wallet debit and receive fiat separately", () => {
    const ledger = pickNoahGlobalPayoutLedgerFields(
      {
        Direction: "Out",
        CryptoCurrency: "USDC",
        CryptoAmount: "4.52",
        FiatPayment: { Amount: "5000", FiatCurrency: "NGN" },
      },
      { sourceBalanceCurrency: "USD" },
    )
    expect(ledger).toMatchObject({
      amount: 4.52,
      currency: "USD",
      baseCurrency: "USD",
      asset: "USDC",
      receiveAmount: 5000,
      receiveCurrency: "NGN",
    })
  })

  it("falls back to cryptoAuthorizedAmount hint when payload omits crypto", () => {
    const ledger = pickNoahGlobalPayoutLedgerFields(
      {
        Direction: "Out",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "5000", FiatCurrency: "NGN" },
      },
      { cryptoAuthorizedAmount: "4.520628", sourceBalanceCurrency: "USD" },
    )
    expect(ledger.amount).toBeCloseTo(4.520628)
    expect(ledger.currency).toBe("USD")
  })
})

describe("settlementWalletCurrencyForNoahCrypto", () => {
  it("maps USDC to USD balance currency", () => {
    expect(settlementWalletCurrencyForNoahCrypto("USDC")).toBe("USD")
  })
})
