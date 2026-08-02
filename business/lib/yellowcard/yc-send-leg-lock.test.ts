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

  it("locks 2000 NGN on first attempt at yc_sell 1373 (production webhook rate)", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.480117,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        const converted = Math.round(settlementCryptoUsd * ycSell * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: "send-1",
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          rate: ycSell,
          settlementInfo: {
            cryptoAmount: settlementCryptoUsd,
            cryptoLocalRate: ycSell,
            walletAddress: "w",
          },
        }
      },
    })

    expect(call).toBe(1)
    expect(submittedCrypto[0]).toBeLessThan(1.48011)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
  })

  it("retargets up when YC converts below yc_sell (observed ~1364.9)", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const lowRate = 2018.31 / 1.478772

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.478772,
      destinationRate: 1366.135,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        if (call === 1) {
          return {
            id: "send-1",
            convertedAmount: 2018.31,
            serviceFeeAmountLocal: 20.18,
            settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
          }
        }
        const converted = Math.round(settlementCryptoUsd * lowRate * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: `send-${call}`,
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(call).toBeLessThanOrEqual(3)
    expect(submittedCrypto[1]).toBeGreaterThan(submittedCrypto[0]!)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
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

  it("trims crypto when YC net local exceeds quoted receive", async () => {
    let call = 0
    const submittedCrypto: number[] = []
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.48011,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        const converted = Math.round(settlementCryptoUsd * ycSell * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: `send-${call}`,
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          rate: ycSell,
          settlementInfo: {
            cryptoAmount: settlementCryptoUsd,
            cryptoLocalRate: ycSell,
            walletAddress: "w",
          },
        }
      },
    })

    expect(call).toBeLessThanOrEqual(2)
    expect(submittedCrypto[0]).toBeLessThan(1.48011)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
  })
})
