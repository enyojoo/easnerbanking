import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./send-submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./send-submit")>()
  return {
    ...actual,
    hydrateYcSendSubmitResult: (sendRes: unknown) => Promise.resolve(sendRes),
  }
})

import { submitYcSendWithDestinationAmountLock } from "./yc-send-leg-lock"
import type { YcSendSubmitResult } from "./send-submit"

describe("submitYcSendWithDestinationAmountLock", () => {
  it("retries with bumped crypto when YC net local is short (gross ok, fee deducted)", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-1",
        convertedAmount: 2011.88,
        serviceFeeAmountLocal: 20.12,
        settlementInfo: { cryptoAmount: 1.458672, walletAddress: "w" },
      },
      {
        id: "send-2",
        convertedAmount: 2020.12,
        serviceFeeAmountLocal: 20.12,
        settlementInfo: { cryptoAmount: 1.464672, walletAddress: "w" },
      },
    ]
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.458672,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async () => {
        call += 1
        return responses[call - 1]
      },
    })

    expect(call).toBe(2)
    expect(result.lockedLocalAmount).toBe(2020.12)
    expect(result.sendRes.id).toBe("send-2")
    expect(result.finalSettlementCryptoUsd).toBeGreaterThan(1.458672)
  })

  it("retries with bumped crypto when gross localAmount is short and no fee field", async () => {
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
      buildSubmit: async () => {
        call += 1
        return responses[call - 1]
      },
    })

    expect(call).toBe(2)
    expect(result.lockedLocalAmount).toBe(2000)
    expect(result.sendRes.id).toBe("send-2")
  })
})
