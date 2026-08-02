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

/** Simulate YC full-precision conversion at rate, then 1% fee. */
function ycLockResponse(crypto: number, rate: number, id: string): YcSendSubmitResult {
  const converted = Math.round(crypto * rate * 100) / 100
  const fee = Math.round(converted * 0.01 * 100) / 100
  return {
    id,
    convertedAmount: converted,
    serviceFeeAmountLocal: fee,
    rate,
    settlementInfo: {
      cryptoAmount: crypto,
      cryptoLocalRate: rate,
      walletAddress: "w",
    },
  }
}

describe("submitYcSendWithDestinationAmountLock", () => {
  it("locks ~2000 NGN with 1.471384 USDC at yc_sell 1373 (not 1.48 overshoot)", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.48,
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
    expect(submittedCrypto[0]).toBeCloseTo(1.471384, 6)
    expect(submittedCrypto[0]).toBeLessThan(1.48)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
  })

  it("rejects production 1.48 overshoot (net 2011.72) and trims toward 2000", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      // sizedInitial overrides this to ~1.471384
      initialSettlementCryptoUsd: 1.48,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        return ycLockResponse(settlementCryptoUsd, ycSell, `send-${call}`)
      },
    })

    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeLessThanOrEqual(2000.01)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(submittedCrypto[0]).toBeLessThan(1.48)
  })

  it("retargets up from shortfall without jumping to 1.48 overshoot", async () => {
    const submittedCrypto: number[] = []
    let call = 0
    const ycSell = 1373
    // First lock converts worse than yc_sell (short); retry uses submitted crypto @ yc_sell.
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.471384,
      destinationRate: 1366.135,
      ycSellRate: ycSell,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        call += 1
        if (call === 1) {
          return {
            id: "send-1",
            convertedAmount: 2018.31,
            serviceFeeAmountLocal: 20.18,
            settlementInfo: {
              cryptoAmount: settlementCryptoUsd,
              walletAddress: "w",
            },
          }
        }
        return ycLockResponse(settlementCryptoUsd, ycSell, `send-${call}`)
      },
    })

    expect(call).toBeLessThanOrEqual(3)
    expect(submittedCrypto[1]!).toBeGreaterThan(submittedCrypto[0]!)
    expect(Math.max(...submittedCrypto)).toBeLessThan(1.48)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(2000)
    expect(net).toBeLessThanOrEqual(2000.01)
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
    expect(net).toBeLessThanOrEqual(12550.01)
  })
})
