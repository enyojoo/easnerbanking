import { describe, expect, it } from "vitest"
import {
  buildNoahBankPayInLedgerMetadata,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationOutLeg,
} from "./bank-onramp-tx"

const FIAT_PAY_IN = {
  ID: "3141c65e-1832-5952-9383-a044a1b3cae9",
  Amount: "9.946",
  Status: "Settled",
  Network: "OffNetwork",
  Direction: "In",
  CryptoCurrency: "USDC",
  Breakdown: [
    { Type: "ChannelFee", Amount: "2.054" },
    { Type: "Remaining", Amount: "9.946" },
  ],
  FiatPayment: {
    Amount: "12",
    FeeAmount: "2.06",
    FiatCurrency: "USD",
    PaymentSystemID: "026073154040278",
  },
  FiatPaymentMethod: {
    AccountHolderDetails: {
      Name: { FirstName: "SAMUEL", MiddleName: "ENYOJO", LastName: "ODIBA" },
    },
  },
  Orchestration: {
    RuleID: "d6ce313f-e506-5686-aaa0-f920d82831ce",
    RuleExecutionID: "5a7b2c0b-ffe5-5e67-8ffb-f053632fd7f1",
  },
} as Record<string, unknown>

const ORCHESTRATION_OUT = {
  ID: "bd93a99f-35d9-58b0-ac96-4122b7cabb69",
  Amount: "9.944074",
  Status: "Settled",
  Network: "Solana",
  Direction: "Out",
  CryptoCurrency: "USDC",
  Orchestration: {
    RuleExecutionID: "5a7b2c0b-ffe5-5e67-8ffb-f053632fd7f1",
  },
} as Record<string, unknown>

describe("bank-onramp-tx", () => {
  it("classifies fiat pay-in and orchestration out legs", () => {
    expect(isNoahBankOnrampFiatPayIn(FIAT_PAY_IN)).toBe(true)
    expect(isNoahBankOnrampOrchestrationOutLeg(ORCHESTRATION_OUT)).toBe(true)
    expect(isNoahBankOnrampOrchestrationOutLeg(FIAT_PAY_IN)).toBe(false)
  })

  it("extracts enrichment from fiat pay-in payload", () => {
    const e = extractNoahBankPayInEnrichment(FIAT_PAY_IN)
    expect(e).not.toBeNull()
    expect(e!.fiatAmount).toBe(12)
    expect(e!.feeAmount).toBe(2.06)
    expect(e!.settledStablecoinAmount).toBe(9.946)
    expect(e!.senderDisplayName).toBe("SAMUEL ENYOJO ODIBA")
    expect(e!.walletLedgerCurrency).toBe("USD")
    const meta = buildNoahBankPayInLedgerMetadata(FIAT_PAY_IN, e!, {
      status: "settled",
      occurredAt: "2026-05-19T22:00:53Z",
    })
    expect(meta.settled_amount).toBe(9.95)
    expect(meta.settled_currency).toBe("USD")
    expect(meta.processing_at).toBeTruthy()
    expect(meta.completed_at).toBeTruthy()
    expect(e!.ruleExecutionId).toBe("5a7b2c0b-ffe5-5e67-8ffb-f053632fd7f1")
  })
})
