import { describe, expect, it, vi } from "vitest"

const listGridDiscoveries = vi.fn()

vi.mock("@/lib/grid/discoveries", () => ({
  listGridDiscoveries: (...args: unknown[]) => listGridDiscoveries(...args),
  gridDiscoverySupportsCorridor: vi.fn(() => true),
}))

import { gridPayoutProvider } from "./grid-provider"

describe("gridPayoutProvider.supports", () => {
  it("does not page Grid discoveries on the quote/confirm hot path", async () => {
    await expect(
      gridPayoutProvider.supports({
        countryCode: "NG",
        currencyCode: "NGN",
        rail: "bank_transfer",
        providerRouting: [{ provider: "grid", priority: 1 }],
      }),
    ).resolves.toBe(true)
    expect(listGridDiscoveries).not.toHaveBeenCalled()
  })
})
