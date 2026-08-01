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
  it("retries when localAmount matches quote but gross convertedAmount net is short", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-1",
        localAmount: 2000,
        convertedAmount: 2011.88,
        settlementInfo: { cryptoAmount: 1.458672, walletAddress: "w" },
      },
      {
        id: "send-2",
        localAmount: 2000,
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
  })

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
    const submittedCrypto: number[] = []

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.458672,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        return responses[call - 1]
      },
    })

    expect(call).toBe(2)
    expect(result.lockedLocalAmount).toBe(2020.12)
    expect(result.sendRes.id).toBe("send-2")
    expect(result.finalSettlementCryptoUsd).toBeGreaterThan(1.458672)
    // Retarget must clear the production shortfall (net 1991.76) in one step.
    expect(submittedCrypto[1]).toBeGreaterThan(1.458672 + 8.24 / 1371.11)
  })

  it("retargets when first lock matches production net 1991.76 shortfall", async () => {
    const submittedCrypto: number[] = []
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.458672,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        if (call === 1) {
          return {
            id: "send-1",
            convertedAmount: 2011.88,
            serviceFeeAmountLocal: 20.12,
            settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
          }
        }
        // Scale convertedAmount with submitted crypto at the observed YC rate.
        const observedRate = 2011.88 / 1.458672
        const converted = Math.round(settlementCryptoUsd * observedRate * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: "send-2",
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(call).toBe(2)
    expect(result.lockedLocalAmount - (result.sendRes.serviceFeeAmountLocal ?? 0)).toBeGreaterThanOrEqual(
      1999,
    )
    expect(submittedCrypto[1]).toBeGreaterThan(submittedCrypto[0]!)
  })

  it("retries with bumped crypto when gross local is short and no fee field", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-1",
        convertedAmount: 1998,
        settlementInfo: { cryptoAmount: 1.45, walletAddress: "w" },
      },
      {
        id: "send-2",
        convertedAmount: 2000,
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

  it("retries with trimmed crypto when YC net local exceeds quoted receive", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-1",
        convertedAmount: 2027.13,
        serviceFeeAmountLocal: 20.27,
        settlementInfo: { cryptoAmount: 1.472227, walletAddress: "w" },
      },
      {
        id: "send-2",
        convertedAmount: 2020.27,
        serviceFeeAmountLocal: 20.27,
        settlementInfo: { cryptoAmount: 1.467227, walletAddress: "w" },
      },
    ]
    let call = 0
    const submittedCrypto: number[] = []

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.472227,
      destinationRate: 1379,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        return responses[call - 1]
      },
    })

    expect(call).toBe(2)
    expect(submittedCrypto[1]).toBeLessThan(submittedCrypto[0]!)
    expect(result.lockedLocalAmount).toBe(2020.27)
    expect(result.sendRes.id).toBe("send-2")
    expect(result.finalSettlementCryptoUsd).toBeLessThan(1.472227)
  })
})
