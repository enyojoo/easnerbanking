import { describe, expect, it } from "vitest"
import {
  extractNoahGlobalPayoutPayOutEnrichment,
  isNoahGlobalPayoutOrchestrationInLeg,
  isNoahGlobalPayoutOrchestrationInLegShape,
  isNoahGlobalPayoutSellTx,
  pendingGlobalPayoutProviderTransactionId,
  pickNoahGlobalPayoutLedgerFields,
} from "@/lib/noah/global-payout-ledger"

describe("isNoahGlobalPayoutOrchestrationInLegShape", () => {
  it("matches Solana IN USDC without ExternalID or Orchestration (pending webhook)", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInLegShape({
        Direction: "In",
        Network: "Solana",
        CryptoCurrency: "USDC",
        PublicID: "sig-abc",
      }),
    ).toBe(true)
  })

  it("rejects OffNetwork fiat pay-in shape", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInLegShape({
        Direction: "In",
        Network: "OffNetwork",
        CryptoCurrency: "USDC",
        FiatPayment: { Amount: "100", FiatCurrency: "USD" },
      }),
    ).toBe(false)
  })
})

describe("isNoahGlobalPayoutOrchestrationInLeg", () => {
  it("matches Solana IN orchestration leg for global payout", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInLeg({
        Direction: "In",
        Network: "Solana",
        CryptoCurrency: "USDC",
        ExternalID: "56ed5056-71fa-44c1-96cc-4b404197f11f",
        Orchestration: { RuleExecutionID: "9ddfacd4-57de-11f1-a03a-ea31bc6f4dc9" },
      }),
    ).toBe(true)
  })

  it("matches pending IN before ExternalID is present", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInLeg({
        Direction: "In",
        Network: "Solana",
        CryptoCurrency: "USDC",
        PublicID: "sig-abc",
      }),
    ).toBe(true)
  })

  it("rejects OffNetwork OUT fiat payout shape", () => {
    expect(
      isNoahGlobalPayoutOrchestrationInLeg({
        Direction: "Out",
        Network: "OffNetwork",
        CryptoCurrency: "USDC",
        ExternalID: "56ed5056-71fa-44c1-96cc-4b404197f11f",
        FiatPayment: { Amount: "5000", FiatCurrency: "NGN" },
        Orchestration: { RuleExecutionID: "9ddfacd4-57de-11f1-a03a-ea31bc6f4dc9" },
      }),
    ).toBe(false)
  })
})

describe("extractNoahGlobalPayoutPayOutEnrichment", () => {
  it("pulls beneficiary and bank fields from OffNetwork OUT webhook", () => {
    const enrichment = extractNoahGlobalPayoutPayOutEnrichment({
      Direction: "Out",
      CryptoCurrency: "USDC",
      FiatPayment: { Amount: "5000", FiatCurrency: "NGN", Rate: "1356.04" },
      FiatPaymentMethod: {
        Country: "NG",
        IssuerDetails: { Name: "Kuda" },
        DisplayDetails: { BankCode: "090267", AccountNumber: "2067816945" },
        AccountHolderDetails: {
          Name: { FirstName: "ODIBA,", MiddleName: "ENYOJO", LastName: "SAMUEL" },
        },
      },
    })
    expect(enrichment?.receiveAmount).toBe(5000)
    expect(enrichment?.receiveCurrency).toBe("NGN")
    expect(enrichment?.bankName).toBe("Kuda")
    expect(enrichment?.accountNumber).toBe("2067816945")
    expect(enrichment?.beneficiaryName).toContain("SAMUEL")
  })
})

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
