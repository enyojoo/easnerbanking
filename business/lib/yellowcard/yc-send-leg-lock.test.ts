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
  it.each([2000, 100_000, 1_000_000])(
    "never underpays NGN target %s and caps surplus to one USDC-cent bucket",
    async (target) => {
      const rate = 1378
      const result = await submitYcSendWithDestinationAmountLock({
        receiveAmount: target,
        initialSettlementCryptoUsd: target / rate,
        destinationRate: rate,
        ycSellRate: rate,
        receiveCurrency: "NGN",
        feeConfig: { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 },
        buildSubmit: async ({ settlementCryptoUsd, attempt }) =>
          ycLockResponse(settlementCryptoUsd, rate, `send-${attempt}`),
      })

      expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(target)
      expect(result.recipientLocalAmount - target).toBeLessThanOrEqual(13.8)
    },
  )

  it("chooses 2012.20 instead of underpaying with the adjacent 2000.20 bucket", async () => {
    const responses: YcSendSubmitResult[] = [
      {
        id: "send-high",
        convertedAmount: 2012.2,
        settlementInfo: { cryptoAmount: 1.48, walletAddress: "w" },
      },
      {
        id: "send-low",
        convertedAmount: 2000.2,
        settlementInfo: { cryptoAmount: 1.47, walletAddress: "w" },
      },
    ]
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2005,
      initialSettlementCryptoUsd: 1.48,
      destinationRate: 1360,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      feeConfig: { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 },
      buildSubmit: async () => responses[call++]!,
    })

    expect(call).toBe(2)
    expect(result.sendRes.id).toBe("send-high")
    expect(result.recipientLocalAmount).toBe(2012.2)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(2005)
  })

  it("jumps toward the target and retains the smallest sufficient response", async () => {
    const responses: YcSendSubmitResult[] = [
      { id: "low-1", convertedAmount: 1900, settlementInfo: { cryptoAmount: 1.4, walletAddress: "w" } },
      { id: "low-2", convertedAmount: 1999, settlementInfo: { cryptoAmount: 1.47, walletAddress: "w" } },
      { id: "high", convertedAmount: 2012, settlementInfo: { cryptoAmount: 1.48, walletAddress: "w" } },
    ]
    let call = 0

    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.4,
      destinationRate: 1360,
      receiveCurrency: "NGN",
      feeConfig: { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 },
      buildSubmit: async () => responses[call++]!,
    })

    expect(call).toBe(3)
    expect(result.sendRes.id).toBe("high")
    expect(result.recipientLocalAmount).toBe(2012)
  })

  it("selects the adjacent sufficient YC bucket instead of underpaying", async () => {
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

    expect(call).toBe(2)
    expect(submittedCrypto[0]).not.toBe(Math.round(submittedCrypto[0]! * 100) / 100)
    expect(result.finalSettlementCryptoUsd).toBe(1.48)
    expect(result.precisionMode).toBe("cent")
    expect(result.recipientLocalAmount).toBe(2011.72)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(2000)
  })

  it("selects production 1.48 path when 1.47 would underpay", async () => {
    let call = 0
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.48,
      destinationRate: 1366.135,
      ycSellRate: 1373,
      receiveCurrency: "NGN",
      buildSubmit: async ({ settlementCryptoUsd }) => {
        call += 1
        return ycLockResponse(settlementCryptoUsd, 1373, `send-${call}`)
      },
    })

    expect(result.recipientLocalAmount).toBe(2011.72)
    expect(result.finalSettlementCryptoUsd).toBe(1.48)
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

    expect(submittedCrypto[0]).not.toBe(Math.round(submittedCrypto[0]! * 100) / 100)
    expect(result.finalSettlementCryptoUsd).toBe(1.48)
    expect(call).toBe(2)
    expect(result.recipientLocalAmount).toBe(2011.72)
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
      feeConfig: { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 },
      buildSubmit: async () => {
        call += 1
        return responses[Math.min(call, responses.length) - 1]!
      },
    })

    expect(call).toBeGreaterThanOrEqual(1)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(2000)
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

    expect(call).toBeGreaterThanOrEqual(1)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(12550)
  })

  it("preserves micro-USDC and selects the smallest sufficient local quantum", async () => {
    const submitted: number[] = []
    const rate = 1378
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.47,
      destinationRate: rate,
      ycSellRate: rate,
      receiveCurrency: "NGN",
      feeConfig: { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 },
      buildSubmit: async ({ settlementCryptoUsd, attempt }) => {
        submitted.push(settlementCryptoUsd)
        const converted = Math.round(settlementCryptoUsd * rate * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: `micro-${attempt}`,
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(result.precisionMode).toBe("micro")
    expect(result.settlementQuantumUsd).toBe(0.000001)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(2000)
    expect(result.recipientSurplusLocal).toBeLessThanOrEqual(result.payoutQuantumLocal)
    expect(result.finalSettlementCryptoUsd).toBe(
      result.sendRes.settlementInfo?.cryptoAmount,
    )
    expect(submitted.length).toBeLessThanOrEqual(24)
  })

  it("detects cent payout buckets when YC echoes six-decimal funding amounts", async () => {
    const submitted: number[] = []
    let active = 0
    let maxActive = 0
    const rate = 1373
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.468537,
      destinationRate: rate,
      ycSellRate: rate,
      receiveCurrency: "NGN",
      feeConfig: { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 },
      parallelBoundaryProbe: true,
      buildSubmit: async ({ settlementCryptoUsd, attempt }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        submitted.push(settlementCryptoUsd)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        const conversionCrypto = Math.round(settlementCryptoUsd * 100) / 100
        const converted = Math.round(conversionCrypto * rate * 100) / 100
        const fee = Math.round(converted * 0.01 * 100) / 100
        return {
          id: `echoed-${attempt}`,
          convertedAmount: converted,
          serviceFeeAmountLocal: fee,
          settlementInfo: { cryptoAmount: settlementCryptoUsd, walletAddress: "w" },
        }
      },
    })

    expect(result.precisionMode).toBe("cent")
    expect(result.settlementQuantumUsd).toBe(0.01)
    expect(result.finalSettlementCryptoUsd).toBe(1.475)
    expect(result.recipientLocalAmount).toBe(2011.72)
    expect(result.recipientSurplusLocal).toBeLessThanOrEqual(result.payoutQuantumLocal)
    expect(submitted).toHaveLength(2)
    expect(maxActive).toBe(2)
    expect(submitted.some((amount) => !isNaN(amount) && amount * 100 % 1 !== 0)).toBe(true)
  })

  it("creates one YC send for the production safe-surplus lock", async () => {
    const submitted: number[] = []
    const rate = 1373
    const result = await submitYcSendWithDestinationAmountLock({
      receiveAmount: 2000,
      initialSettlementCryptoUsd: 1.468537,
      destinationRate: rate,
      ycSellRate: rate,
      receiveCurrency: "NGN",
      feeConfig: { minFeeLocal: 0, feePercentage: 1, flatFeeLocal: 0 },
      singleSafeSurplusLock: true,
      buildSubmit: async ({ settlementCryptoUsd }) => {
        submitted.push(settlementCryptoUsd)
        return ycLockResponse(settlementCryptoUsd, rate, "selected-send")
      },
    })

    expect(submitted).toEqual([1.475])
    expect(result.sendRes.id).toBe("selected-send")
    expect(result.finalSettlementCryptoUsd).toBe(1.48)
    expect(result.recipientLocalAmount).toBe(2011.72)
    expect(result.recipientLocalAmount).toBeGreaterThanOrEqual(2000)
    expect(result.recipientSurplusLocal).toBeLessThanOrEqual(result.payoutQuantumLocal)
    expect(result.discardedSendIds).toEqual([])
  })

  it("fails closed without creating another send when the one-shot lock underpays", async () => {
    const buildSubmit = vi.fn(async (): Promise<YcSendSubmitResult> => ({
      id: "unsafe-send",
      convertedAmount: 1999.99,
      settlementInfo: { cryptoAmount: 1.48, walletAddress: "w" },
    }))

    await expect(
      submitYcSendWithDestinationAmountLock({
        receiveAmount: 2000,
        initialSettlementCryptoUsd: 1.468537,
        destinationRate: 1373,
        ycSellRate: 1373,
        receiveCurrency: "NGN",
        feeConfig: { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 },
        singleSafeSurplusLock: true,
        buildSubmit,
      }),
    ).rejects.toMatchObject({ code: "YC_SEND_NO_COMPLIANT_QUANTUM", status: 422 })
    expect(buildSubmit).toHaveBeenCalledTimes(1)
  })

  it("fails closed when YC returns unsupported settlement precision", async () => {
    await expect(
      submitYcSendWithDestinationAmountLock({
        receiveAmount: 2000,
        initialSettlementCryptoUsd: 1.47,
        destinationRate: 1378,
        receiveCurrency: "NGN",
        feeConfig: { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 },
        buildSubmit: async () => ({
          id: "odd",
          convertedAmount: 2000,
          settlementInfo: { cryptoAmount: 1.4685, walletAddress: "w" },
        }),
      }),
    ).rejects.toMatchObject({ code: "YC_SEND_PRECISION_UNDETERMINED", status: 422 })
  })
})
