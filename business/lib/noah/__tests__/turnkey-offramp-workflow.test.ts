import { describe, expect, it, vi, beforeEach } from "vitest"

const noahFetchMock = vi.fn()

vi.mock("@/lib/noah/http", () => ({
  noahFetch: (...args: unknown[]) => noahFetchMock(...args),
}))

import { pickTriggerCryptoAmount, startOnchainDepositToPaymentWorkflow } from "@/lib/terminal/automated-payout-workflow"

describe("pickTriggerCryptoAmount", () => {
  it("prefers crypto authorized amount for GTEQ trigger", () => {
    expect(pickTriggerCryptoAmount("3.500000", "3.1")).toBe("3.500000")
  })
})

describe("startOnchainDepositToPaymentWorkflow payload", () => {
  beforeEach(() => {
    noahFetchMock.mockReset()
    noahFetchMock.mockResolvedValue({ DestinationAddress: "noah-deposit-addr" })
  })

  it("posts Standard Model workflow with Solana source trigger", async () => {
    await startOnchainDepositToPaymentWorkflow({
      customerId: "cust-1",
      cryptoCurrency: "USDC",
      fiatAmount: "5000.00",
      formSessionId: "fs-1",
      externalId: "payout-uuid",
      network: "Solana",
      sourceAddress: "turnkey-vault-pubkey",
      cryptoTriggerAmount: "3.42",
    })

    expect(noahFetchMock).toHaveBeenCalledOnce()
    const call = noahFetchMock.mock.calls[0]![0] as { json: Record<string, unknown> }
    expect(call.json.CustomerID).toBe("cust-1")
    expect(call.json.ExternalID).toBe("payout-uuid")
    expect(call.json.FormSessionID).toBe("fs-1")
    const trigger = call.json.Trigger as Record<string, unknown>
    expect(trigger.SourceAddress).toBe("turnkey-vault-pubkey")
    const conditions = trigger.Conditions as Array<Record<string, unknown>>
    expect(conditions[0]?.Network).toBe("Solana")
    const amountConditions = conditions[0]?.AmountConditions as Array<Record<string, unknown>>
    expect(amountConditions[0]?.ComparisonOperator).toBe("GTEQ")
    expect(amountConditions[0]?.Value).toBe("3.42")
  })
})

import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"

describe("Noah settlement crypto tickers", () => {
  it("maps balance currencies to Standard Model settlement assets", () => {
    expect(getNoahUsdCryptoTicker()).toBe("USDC")
    expect(getNoahEurCryptoTicker()).toBe("EURC")
  })
})
