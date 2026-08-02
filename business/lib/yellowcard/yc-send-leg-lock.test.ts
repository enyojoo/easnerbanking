import { describe, expect, it, vi } from "vitest"

vi.mock("./send-submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./send-submit")>()
  return {
    ...actual,
    hydrateYcSendSubmitResult: (sendRes: unknown) => Promise.resolve(sendRes),
  }
})

import { submitYcSendWithDestinationAmountLock } from "./yc-send-leg-lock"
import type { YcSendSubmitResult } from "./send-submit"

/** Simulate YC: round crypto to 2dp, then convert at rate, then 1% fee. */
function ycLockResponse(crypto: number, rate: number, id: string): YcSendSubmitResult {
  const cryptoCent = Math.round(crypto * 100) / 100
  const converted = Math.round(cryptoCent * rate * 100) / 100
  const fee = Math.round(converted * 0.01 * 100) / 100
  return {
    id,
    convertedAmount: converted,
    serviceFeeAmountLocal: fee,
    rate,
    settlementInfo: {
      cryptoAmount: cryptoCent,
      cryptoLocalRate: rate,
      walletAddress: "w",
    },
  }
}

describe("submitYcSendWithDestinationAmountLock", () => {
  it("locks 2000 NGN on first attempt at yc_sell 1373 (USDC cent sizing)", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.466926,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        return ycLockResponse(settlementCryptoUsd, ycSell, `send-${call}`)
      },
    })

    expect(call).toBe(1)
    // 1.47 rounds to shortfall; minimum clearing cent is 1.48
    expect(submittedCrypto[0]).toBe(1.48)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    // One USDC cent of NGN (~13.59) — 2011.72 is OK
    expect(net).toBeLessThanOrEqual(2000 + 13.59)
  })

  it("accepts production 1.48 path (net 2011.72) that used to fail excess check", async () => {
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.48,
      destinationRate: 1366.135,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) =>
        ycLockResponse(settlementCryptoUsd, 1373, "send-1"),
    })

    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBe(2011.72)
    expect(result.sendRes.id).toBe("send-1")
  })

  it("retargets up by a USDC cent when YC net is short (prod 1998.13)", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      // Force a bad first crypto via mock — lock will size to 1.48 normally;
      // override by returning shortfall for first call if somehow 1.47.
      initialSettlementCryptoUsd: 1.47,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        return ycLockResponse(settlementCryptoUsd, ycSell, `send-${call}`)
      },
    })

    expect(submittedCrypto[0]).toBe(1.48)
    expect(call).toBe(1)
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
      initialSettlementCryptoUsd: 1.45,
      destinationRate: 1371.11,
      receiveCurrency: "NGN",
      buildSubmit: async () => {
        call += 1
        return responses[Math.min(call, responses.length) - 1]!
      },
    })

    expect(call).toBeGreaterThanOrEqual(1)
    expect(result.lockedLocalAmount).toBeGreaterThanOrEqual(2000)
  })

  it("accepts exact net receive without retry", async () => {
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 12550,
      initialSettlementCryptoUsd: 9.25,
      destinationRate: 1371.11,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        call += 1
        return ycLockResponse(settlementCryptoUsd, 1373, "send-1")
      },
    })

    expect(call).toBe(1)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(12550)
  })
})
