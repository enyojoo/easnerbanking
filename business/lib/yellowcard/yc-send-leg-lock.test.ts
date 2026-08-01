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
  it("locks on first attempt when localAmount gross targets quoted net", async () => {
    let call = 0
    const submitted: Array<{ crypto: number; localGross: number }> = []

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.478772,
      destinationRate: 1366.135,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd, settlementLocalGross }) => {
        submitted.push({ crypto: settlementCryptoUsd, localGross: settlementLocalGross })
        call += 1
        // With localAmount gross ~2021, YC locks net 2000 on first POST.
        return {
          id: "send-1",
          convertedAmount: 2020.2,
          serviceFeeAmountLocal: 20.2,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(call).toBe(1)
    expect(submitted[0]?.localGross).toBeGreaterThanOrEqual(2020.2)
    expect(result.lockedLocalAmount - 20.2).toBeGreaterThanOrEqual(2000)
  })

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

  it("retargets production shortfall net 1998.13 → >= 2000 in one retry", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const initial = 1.478772
    const firstGross = 2018.31
    const observedRate = firstGross / initial

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: initial,
      destinationRate: 1366.135,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        if (call === 1) {
          return {
            id: "send-1",
            convertedAmount: firstGross,
            serviceFeeAmountLocal: 20.18,
            settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
          }
        }
        const converted = Math.round(settlementCryptoUsd * observedRate * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: `send-${call}`,
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(call).toBe(2)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
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

  it("accepts exact net receive without retry", async () => {
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 12550,
      initialSettlementCryptoUsd: 9.25,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async () => {
        call += 1
        return {
          id: "send-1",
          convertedAmount: 12676.77,
          serviceFeeAmountLocal: 126.77,
          settlementInfo: { cryptoAmount: 9.25, walletAddress: "w" },
        }
      },
    })

    expect(call).toBe(1)
    expect(result.sendRes.id).toBe("send-1")
    expect(result.lockedLocalAmount - 126.77).toBe(12550)
  })

  it("retries with trimmed crypto when YC net local exceeds quoted receive", async () => {
    let call = 0
    const submittedCrypto: number[] = []

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.4735,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        if (call === 1) {
          return {
            id: "send-1",
            convertedAmount: 2025.66,
            serviceFeeAmountLocal: 20.26,
            settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
          }
        }
        const observedRate = 2025.66 / 1.4735
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
    expect(submittedCrypto[1]).toBeLessThan(submittedCrypto[0]!)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
  })
})
