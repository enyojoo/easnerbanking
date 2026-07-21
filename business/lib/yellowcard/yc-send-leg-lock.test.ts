import { describe, expect, it, vi } from "vitest"
import { submitYcSendWithDestinationAmountLock } from "./yc-send-leg-lock"
import type { YcSendSubmitResult } from "./send-submit"

describe("submitYcSendWithDestinationAmountLock", () => {
  it("retries with bumped crypto when YC localAmount is short", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-1",
        localAmount: 1991.76,
        settlementInfo: { cryptoAmount: 1.45, walletAddress: "w" },
      },
      {
        id: "send-2",
        localAmount: 2000,
        settlementInfo: { cryptoAmount: 1.46, walletAddress: "w" },
      },
    ]
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.458672,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        call += 1
        return responses[call - 1]
      },
    })

    expect(call).toBe(2)
    expect(result.lockedLocalAmount).toBe(2000)
    expect(result.sendRes.id).toBe("send-2")
    expect(result.finalSettlementCryptoUsd).toBeGreaterThan(1.458672)
  })
})
