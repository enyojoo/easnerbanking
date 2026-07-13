import { describe, expect, it } from "vitest"
import {
  buildNoahGlobalPayoutOrchestrationInSuppressMetadata,
  extractNoahGlobalPayoutPayOutEnrichment,
  extractNoahRefundHintsFromOrchestrationIn,
  inboundMatchesGlobalPayoutRefundAmount,
  isNoahGlobalPayoutOrchestrationInLeg,
  isNoahGlobalPayoutOrchestrationInLegShape,
  isNoahGlobalPayoutRefundOutLeg,
  isNoahGlobalPayoutSellTx,
  pendingGlobalPayoutProviderTransactionId,
  pickNoahGlobalPayoutLedgerFields,
  pickNoahGlobalPayoutOrchestrationRuleExecutionId,
  pickRefundAmountCandidatesFromGlobalPayoutMeta,
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

describe("isNoahGlobalPayoutRefundOutLeg", () => {
  it("matches Noah Solana refund OUT after failed global payout", () => {
    expect(
      isNoahGlobalPayoutRefundOutLeg({
        Direction: "Out",
        Network: "Solana",
        CryptoCurrency: "USDC",
        ExternalID: "3f3045bf-fc29-4934-8dcc-4cbe5821dd17",
        Orchestration: { RuleExecutionID: "8a3494f1-7fc5-568b-b562-34f6e8dcf26c" },
        PublicID: "2N9HgwZRhDiRJSGtpUmAKCukR5fBrB6FKjyyvRh3CjWWeNK8VxWD9BfkL74dpU7skQyzYBHL6zn8BFCqWeRqTqZr",
      }),
    ).toBe(true)
  })

  it("rejects OffNetwork fiat payout shape", () => {
    expect(
      isNoahGlobalPayoutRefundOutLeg({
        Direction: "Out",
        Network: "OffNetwork",
        CryptoCurrency: "USDC",
        ExternalID: "3f3045bf-fc29-4934-8dcc-4cbe5821dd17",
        FiatPayment: { Amount: "1000", FiatCurrency: "NGN" },
        Orchestration: { RuleExecutionID: "b7726190-5c49-11f1-b623-b2d19e5e0dca" },
      }),
    ).toBe(false)
  })

  it("rejects refund shape without ExternalID", () => {
    expect(
      isNoahGlobalPayoutRefundOutLeg({
        Direction: "Out",
        Network: "Solana",
        CryptoCurrency: "USDC",
        Orchestration: { RuleExecutionID: "8a3494f1-7fc5-568b-b562-34f6e8dcf26c" },
      }),
    ).toBe(false)
  })
})

describe("extractNoahRefundHintsFromOrchestrationIn", () => {
  it("maps Refunds array from orchestration IN webhook", () => {
    const hints = extractNoahRefundHintsFromOrchestrationIn({
      Refunds: [
        {
          Status: "Pending",
          Currency: "USDC",
          RefundID: "1c7e06ad-98f0-51a1-b155-80727dbfbd89",
          RefundedAmount: "1.318321",
        },
      ],
    })
    expect(hints?.noah_refund_expected).toBe(true)
    expect(hints?.noah_refund_id).toBe("1c7e06ad-98f0-51a1-b155-80727dbfbd89")
    expect(hints?.noah_refund_amount).toBe("1.318321")
  })
})

describe("pendingGlobalPayoutProviderTransactionId", () => {
  it("prefixes easner payout id for pending rows", () => {
    expect(pendingGlobalPayoutProviderTransactionId("abc-123")).toBe("global_payout_pending:abc-123")
  })
})

describe("pickRefundAmountCandidatesFromGlobalPayoutMeta", () => {
  it("prefers noah_send_amount over total_debited for refund matching", () => {
    const meta = {
      noah_refund_amount: "1.99993",
      noah_send_amount: 1.99993,
      total_debited: 2.014657,
      processing_fee: 0.014727,
    }
    const candidates = pickRefundAmountCandidatesFromGlobalPayoutMeta(meta, 1.99)
    expect(candidates[0]).toBeCloseTo(1.99993, 6)
    expect(candidates[candidates.length - 1]).toBeCloseTo(2.014657, 6)
    expect(inboundMatchesGlobalPayoutRefundAmount(1.99993, meta, 1.99)).toBe(true)
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
