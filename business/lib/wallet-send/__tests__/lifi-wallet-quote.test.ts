import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/lifi/client", () => ({
  lifiQuote: vi.fn(),
}))

import type { LifiQuoteResponse } from "@/lib/lifi/client"
import { lifiQuote } from "@/lib/lifi/client"
import { getLifiBridgeMinSourceUsdc, minReceiveForLifiBridge, quoteLifiWalletBridge } from "../lifi-wallet-quote"

const source = {
  asset: "USDC",
  network: "Solana" as const,
  chainId: "SOL",
  chainKey: "sol",
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
}

const dest = {
  asset: "USDT",
  network: "Tron" as const,
  chainId: 728126428,
  chainKey: "tro",
  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
}

function mockQuote(fromUsdc: number, toUsdt: number): LifiQuoteResponse {
  return {
    id: `q-${fromUsdc}`,
    estimate: {
      fromAmount: String(Math.round(fromUsdc * 1e6)),
      toAmount: String(Math.round(toUsdt * 1e6)),
    },
  }
}

describe("quoteLifiWalletBridgeFromAmountRaw", () => {
  beforeEach(() => {
    vi.mocked(lifiQuote).mockReset()
  })

  it("calls LI.FI once with stored fromAmount", async () => {
    vi.mocked(lifiQuote).mockResolvedValue(mockQuote(10.5, 10))

    const { quoteLifiWalletBridgeFromAmountRaw } = await import("../lifi-wallet-quote")
    const quote = await quoteLifiWalletBridgeFromAmountRaw({
      source,
      dest,
      fromAddress: "from",
      toAddress: "to",
      fromAmountRaw: "10500000",
    })

    expect(quote.estimate?.fromAmount).toBe("10500000")
    expect(vi.mocked(lifiQuote)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(lifiQuote).mock.calls[0][0].fromAmount).toBe("10500000")
  })
})

describe("quoteLifiWalletBridge send mode", () => {
  beforeEach(() => {
    vi.mocked(lifiQuote).mockReset()
  })

  it("never increases fromAmount above sendBudget", async () => {
    vi.mocked(lifiQuote).mockImplementation(async (params) => {
      const from = Number(params.fromAmount) / 1e6
      expect(from).toBe(10)
      return mockQuote(from, 8)
    })

    const quote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress: "from",
      toAddress: "to",
      amountEntryMode: "send",
      receiveAmount: 0,
      sendBudget: 10,
      customerRate: 0.96,
      lifiMid: 0.98,
    })

    expect(Number(quote.estimate?.toAmount) / 1e6).toBe(8)
    expect(vi.mocked(lifiQuote).mock.calls.every((c) => Number(c[0].fromAmount) === 10_000_000)).toBe(true)
  })
})

describe("quoteLifiWalletBridge receive mode", () => {
  beforeEach(() => {
    vi.mocked(lifiQuote).mockReset()
  })

  it("binary search finds minimal input for receive target", async () => {
    vi.mocked(lifiQuote).mockImplementation(async (params) => {
      const from = Number(params.fromAmount) / 1e6
      let to = 0
      if (from < 10) to = from * 0.7
      else if (from < 12) to = 8
      else if (from < 14) to = 9.8
      else to = 12
      return mockQuote(from, to)
    })

    const quote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress: "from",
      toAddress: "to",
      amountEntryMode: "receive",
      receiveAmount: 10,
      customerRate: 0.96,
      lifiMid: 0.98,
    })

    const fromUsdc = Number(quote.estimate?.fromAmount) / 1e6
    expect(fromUsdc).toBeGreaterThanOrEqual(11)
    expect(fromUsdc).toBeLessThanOrEqual(13)
    expect(Number(quote.estimate?.toAmount) / 1e6).toBeGreaterThanOrEqual(9.7)
  })

  it("send $10 and receive 8 USDT converge on same mocked fromAmount", async () => {
    vi.mocked(lifiQuote).mockImplementation(async (params) => {
      const from = Number(params.fromAmount) / 1e6
      const to = from >= 10 ? 8 : from * 0.7
      return mockQuote(from, to)
    })

    const sendQuote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress: "from",
      toAddress: "to",
      amountEntryMode: "send",
      receiveAmount: 0,
      sendBudget: 10,
      customerRate: 0.96,
      lifiMid: 0.98,
    })

    const receiveQuote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress: "from",
      toAddress: "to",
      amountEntryMode: "receive",
      receiveAmount: 8,
      customerRate: 0.96,
      lifiMid: 0.98,
    })

    expect(Number(sendQuote.estimate?.fromAmount)).toBe(10_000_000)
    expect(Number(receiveQuote.estimate?.fromAmount)).toBe(10_000_000)
  })
})

describe("lifiMinFromAmountRaw", () => {
  it("enforces 7 USDC floor in base units", async () => {
    const { lifiMinFromAmountRaw } = await import("../lifi-from-amount")
    expect(lifiMinFromAmountRaw("1000000", 6, 7)).toBe("7000000")
    expect(lifiMinFromAmountRaw("10000000", 6, 7)).toBe("10000000")
  })
})

describe("minReceiveForLifiBridge", () => {
  it("derives receive floor from customer rate", () => {
    expect(minReceiveForLifiBridge(1, 7)).toBe(7)
    expect(minReceiveForLifiBridge(0.5, 7)).toBe(14)
  })

  it("defaults to env-backed 7 USDC source floor", () => {
    expect(getLifiBridgeMinSourceUsdc()).toBeGreaterThanOrEqual(7)
  })
})
