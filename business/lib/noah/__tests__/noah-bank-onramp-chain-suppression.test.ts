import { describe, expect, it } from "vitest"
import {
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationOutLeg,
} from "@/lib/noah/bank-onramp-tx"

describe("Noah bank onramp chain classification (for Turnkey suppression)", () => {
  it("recognizes fiat pay-in payload", () => {
    expect(
      isNoahBankOnrampFiatPayIn({
        Direction: "In",
        Network: "OffNetwork",
        FiatPayment: { Amount: "12", FiatCurrency: "USD" },
      }),
    ).toBe(true)
  })

  it("recognizes orchestration out payload", () => {
    expect(
      isNoahBankOnrampOrchestrationOutLeg({
        Direction: "Out",
        Network: "Solana",
        CryptoCurrency: "USDC",
        Orchestration: { RuleExecutionID: "rule-1" },
      }),
    ).toBe(true)
  })
})
