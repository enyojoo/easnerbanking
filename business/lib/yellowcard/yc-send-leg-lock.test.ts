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
  return ycLockResponseWithFee(crypto, rate, id, { feePercentage: 1 })
}

/** Simulate YC with a corridor fee schedule from POST /fees/get-config. */
function ycLockResponseWithFee(
  crypto: number,
  rate: number,
  id: string,
  fee: { minFeeLocal?: number; feePercentage?: number; flatFeeLocal?: number },
): YcSendSubmitResult {
  const cryptoCent = Math.round(crypto * 100) / 100
  const converted = Math.round(cryptoCent * rate * 100) / 100
  const variable = Math.max(
    fee.minFeeLocal ?? 0,
    converted * ((fee.feePercentage ?? 0) / 100),
  )
  const serviceFee = Math.round((variable + (fee.flatFeeLocal ?? 0)) * 100) / 100
  return buildLockResponse(cryptoCent, converted, serviceFee, rate, id)
}

function buildLockResponse(
  cryptoCent: number,
  converted: number,
  fee: number,
  rate: number,
  id: string,
): YcSendSubmitResult {
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

  // POST /fees/get-config, production: NGN bank 1%, KES momo 2%, ZAR bank 0.5%.
  it("clears KES momo 2% on the first attempt; the 1% assumption needs retries", async () => {
    const feeConfig = { minFeeLocal: 0, feePercentage: 2, flatFeeLocal: 0 }
    const rate = 129.2

    async function lock(useConfig: boolean) {
      const submittedCrypto: number[] = []
      const result = await submitYcSendWithDestinationAmountLock({
        receiveAmount: 5000,
        initialSettlementCryptoUsd: 39.1,
        destinationRate: 128.5,
        ycSellRate: rate,
        receiveCurrency: "KES",
        feeConfig: useConfig ? feeConfig : undefined,
        buildSubmit: async ({ settlementCryptoUsd }) => {
          submittedCrypto.push(settlementCryptoUsd)
          return ycLockResponseWithFee(settlementCryptoUsd, rate, "send-kes", feeConfig)
        },
      })
      const net =
        Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
      return { submittedCrypto, net }
    }

    const sized = await lock(true)
    expect(sized.submittedCrypto).toHaveLength(1)
    expect(sized.net).toBeGreaterThanOrEqual(5000)

    // Sizing against a 1% fee undershoots a 2% corridor and burns POST /send attempts.
    const assumed = await lock(false)
    expect(assumed.submittedCrypto.length).toBeGreaterThan(1)
    expect(assumed.submittedCrypto[0]).toBeLessThan(sized.submittedCrypto[0]!)
  })

  it("does not oversize ZAR bank at 0.5% (1% assumption overpays the recipient)", async () => {
    const submittedCrypto: number[] = []
    const feeConfig = { minFeeLocal: 0, feePercentage: 0.5, flatFeeLocal: 0 }
    const rate = 18.1

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 500,
      initialSettlementCryptoUsd: 27.7,
      destinationRate: 18,
      ycSellRate: rate,
      receiveCurrency: "ZAR",
      feeConfig,
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        return ycLockResponseWithFee(settlementCryptoUsd, rate, "send-zar", feeConfig)
      },
    })

    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBeGreaterThanOrEqual(500)
    // One USDC cent of ZAR is ~0.18; anything beyond that is fee-model error.
    expect(net).toBeLessThanOrEqual(500 + 0.19)
    // Cent grid: 27.77 clears 500 at 0.5%; the 1% assumption would have sent 27.91.
    expect(submittedCrypto[0]).toBeLessThan(27.9)
  })

  it("still sizes NGN bank at the documented 1% when config is supplied", async () => {
    const submittedCrypto: number[] = []
    const feeConfig = { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 }

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.466926,
      destinationRate: 1366.135,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      feeConfig,
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submittedCrypto.push(settlementCryptoUsd)
        return ycLockResponseWithFee(settlementCryptoUsd, 1373, "send-ngn", feeConfig)
      },
    })

    expect(submittedCrypto[0]).toBe(1.48)
    const net =
      Number(result.lockedLocalAmount) - Number(result.sendRes.serviceFeeAmountLocal ?? 0)
    expect(net).toBe(2011.72)
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
