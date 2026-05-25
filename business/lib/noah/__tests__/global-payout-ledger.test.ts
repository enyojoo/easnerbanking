import { describe, expect, it } from "vitest"
import {
  isNoahGlobalPayoutSellTx,
  pendingGlobalPayoutProviderTransactionId,
  pickNoahGlobalPayoutLedgerFields,
} from "@/lib/noah/global-payout-ledger"

describe("isNoahGlobalPayoutSellTx", () => {
  it("matches Noah OUT fiat payout webhook shape", () => {
    expect(
      isNoahGlobalPayoutSellTx({
        Direction: "Out",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "5000", FiatCurrency: "NGN" },
      }),
    ).toBe(true)
  })

  it("rejects IN deposits", () => {
    expect(
      isNoahGlobalPayoutSellTx({
        Direction: "In",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "100", FiatCurrency: "USD" },
      }),
    ).toBe(false)
  })
})

describe("pendingGlobalPayoutProviderTransactionId", () => {
  it("prefixes easner payout id for pending rows", () => {
    expect(pendingGlobalPayoutProviderTransactionId("abc-123")).toBe("global_payout_pending:abc-123")
  })
})

describe("pickNoahGlobalPayoutLedgerFields", () => {
  it("maps receive fiat and wallet debit from Noah tx + hints", () => {
    const fields = pickNoahGlobalPayoutLedgerFields(
      {
        Direction: "Out",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "5000.00", FiatCurrency: "NGN" },
      },
      { cryptoAuthorizedAmount: "3.42", sourceBalanceCurrency: "USD" },
    )
    expect(fields.receiveAmount).toBe(5000)
    expect(fields.receiveCurrency).toBe("NGN")
    expect(fields.amount).toBe(3.42)
    expect(fields.currency).toBe("USD")
  })
})
