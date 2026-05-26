import { describe, expect, it } from "vitest"
import {
  buildNoahGlobalPayoutOrchestrationInSuppressMetadata,
  extractNoahGlobalPayoutPayOutEnrichment,
  isNoahGlobalPayoutOrchestrationInLeg,
  isNoahGlobalPayoutOrchestrationInLegShape,
  isNoahGlobalPayoutSellTx,
  pendingGlobalPayoutProviderTransactionId,
  pickNoahGlobalPayoutLedgerFields,
  pickNoahGlobalPayoutOrchestrationRuleExecutionId,
} from "@/lib/noah/global-payout-ledger"

describe("pickNoahGlobalPayoutOrchestrationRuleExecutionId", () => {
  it("uses transaction ID when Orchestration is missing on pending IN", () => {
    expect(
      pickNoahGlobalPayoutOrchestrationRuleExecutionId({
        ID: "ce13b3e5-580b-11f1-b758-1a25229179b7",
        Direction: "In",
        Network: "Solana",
        CryptoCurrency: "USDC",
      }),
    ).toBe("ce13b3e5-580b-11f1-b758-1a25229179b7")
  })
})

describe("buildNoahGlobalPayoutOrchestrationInSuppressMetadata", () => {
  it("tags suppress_in_feed and global payout flow", () => {
    const meta = buildNoahGlobalPayoutOrchestrationInSuppressMetadata({
      ruleExecutionId: "ce13b3e5-580b-11f1-b758-1a25229179b7",
      solanaTxHash: "sig-abc",
      easnerPayoutId: "3901dbc0-96a8-45ec-8605-9c9b39a069b9",
    })
    expect(meta.suppress_in_feed).toBe(true)
    expect(meta.global_payout_orchestration_in_leg).toBe(true)
    expect(meta.flow).toBe("global_fiat_offramp")
    expect(meta.noah_rule_execution_id).toBe("ce13b3e5-580b-11f1-b758-1a25229179b7")
  })
})

describe("linkGlobalPayoutOutRowFromOrchestrationIn metadata fields", () => {
  it("documents orchestration IN ids stored on OUT row", () => {
    const prior = { payout_type: "global_fiat", easner_payout_id: "payout-1" }
    const patch = {
      ...prior,
      flow: "global_fiat_offramp",
      global_payout_orchestration_in_leg_linked: true,
      noah_orchestration_in_transaction_id: "ce13b3e5-580b-11f1-b758-1a25229179b7",
      noah_orchestration_in_status: "settled",
      noah_rule_execution_id: "ce13b3e5-580b-11f1-b758-1a25229179b7",
      noah_on_chain_tx_hash: "sig-abc",
      turnkey_tx_hash: "sig-abc",
    }
    expect(patch.noah_orchestration_in_transaction_id).toBeTruthy()
    expect(patch.global_payout_orchestration_in_leg_linked).toBe(true)
  })
})

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
    expect(enrichment?.beneficiaryName).toMatch(/samuel/i)
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
