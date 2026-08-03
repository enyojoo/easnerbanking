import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./http", () => ({ yellowcardFetch: vi.fn() }))

import { yellowcardFetch } from "./http"
import { fetchYcSendServiceFeeConfig, resetYcSendFeeConfigCache } from "./send-fee-config"

const query = {
  country: "NG",
  currency: "NGN",
  channelType: "bank" as const,
  directSettlement: true,
}

describe("fetchYcSendServiceFeeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetYcSendFeeConfigCache()
  })

  it("returns percentage, minimum and flat fee configuration", async () => {
    vi.mocked(yellowcardFetch).mockResolvedValue({
      serviceFee: { minFeeLocal: 5, feePercentage: 1, flatFeeLocal: 2 },
    })
    await expect(fetchYcSendServiceFeeConfig(query)).resolves.toEqual({
      minFeeLocal: 5,
      feePercentage: 1,
      flatFeeLocal: 2,
    })
  })

  it("treats YC's explicit no-fee message as authoritative zero", async () => {
    vi.mocked(yellowcardFetch).mockResolvedValue({ message: "No fees configured" })
    await expect(fetchYcSendServiceFeeConfig(query)).resolves.toEqual({
      minFeeLocal: 0,
      feePercentage: 0,
      flatFeeLocal: 0,
    })
  })

  it("bypasses cached indicative fees for a fresh payout lock", async () => {
    vi.mocked(yellowcardFetch)
      .mockResolvedValueOnce({ serviceFee: { feePercentage: 1 } })
      .mockResolvedValueOnce({ serviceFee: { feePercentage: 2 } })
    await expect(fetchYcSendServiceFeeConfig(query)).resolves.toMatchObject({ feePercentage: 1 })
    await expect(fetchYcSendServiceFeeConfig({ ...query, fresh: true })).resolves.toMatchObject({
      feePercentage: 2,
    })
    expect(yellowcardFetch).toHaveBeenCalledTimes(2)
  })

  it("returns null when YC fee configuration is unavailable", async () => {
    vi.mocked(yellowcardFetch).mockRejectedValue(new Error("upstream unavailable"))
    await expect(fetchYcSendServiceFeeConfig({ ...query, fresh: true })).resolves.toBeNull()
  })
})
