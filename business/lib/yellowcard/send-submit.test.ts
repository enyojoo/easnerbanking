import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./http", () => ({
  yellowcardFetch: vi.fn(),
}))

import { yellowcardFetch } from "./http"
import { hydrateYcSendSubmitResult } from "./send-submit"

describe("hydrateYcSendSubmitResult", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns POST response when serviceFeeAmountLocal is present", async () => {
    const post = {
      id: "send-1",
      convertedAmount: 2020.12,
      serviceFeeAmountLocal: 20.12,
    }
    const result = await hydrateYcSendSubmitResult(post)
    expect(result).toEqual(post)
    expect(yellowcardFetch).not.toHaveBeenCalled()
  })

  it("GETs /send/{id} when local fee fields are missing on POST", async () => {
    vi.mocked(yellowcardFetch).mockResolvedValueOnce({
      id: "send-1",
      convertedAmount: 2011.88,
      serviceFeeAmountLocal: 20.12,
      settlementInfo: { cryptoAmount: 1.458672 },
    })
    const result = await hydrateYcSendSubmitResult({
      id: "send-1",
      convertedAmount: 2011.88,
      settlementInfo: { cryptoAmount: 1.458672, walletAddress: "w" },
    })
    expect(yellowcardFetch).toHaveBeenCalledTimes(1)
    expect(result.serviceFeeAmountLocal).toBe(20.12)
  })

  it("polls GET when fee fields are not ready on first fetch", async () => {
    vi.mocked(yellowcardFetch)
      .mockResolvedValueOnce({
        id: "send-1",
        convertedAmount: 2011.88,
        settlementInfo: { cryptoAmount: 1.458672 },
      })
      .mockResolvedValueOnce({
        id: "send-1",
        convertedAmount: 2011.88,
        serviceFeeAmountLocal: 20.12,
        settlementInfo: { cryptoAmount: 1.458672 },
      })

    const result = await hydrateYcSendSubmitResult({
      id: "send-1",
      convertedAmount: 2011.88,
      settlementInfo: { cryptoAmount: 1.458672, walletAddress: "w" },
    })
    expect(yellowcardFetch).toHaveBeenCalledTimes(2)
    expect(result.serviceFeeAmountLocal).toBe(20.12)
  })
})
