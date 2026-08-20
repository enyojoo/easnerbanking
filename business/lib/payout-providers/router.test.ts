import { describe, expect, it, vi } from "vitest"
import { filterProviderRoutingForSender, selectProvider } from "./router"
import type { CorridorContext } from "./types"

vi.mock("./noah-provider", () => ({
  noahPayoutProvider: {
    id: "noah",
    supports: vi.fn(async () => true),
  },
}))

vi.mock("./yellowcard-provider", () => ({
  yellowcardPayoutProvider: {
    id: "yellowcard",
    supports: vi.fn(async () => true),
  },
}))

vi.mock("./grid-provider", () => ({
  gridPayoutProvider: {
    id: "grid",
    supports: vi.fn(async () => true),
  },
}))

describe("selectProvider", () => {
  it("honors Office primary only – does not fall through to secondary", async () => {
    const { yellowcardPayoutProvider } = await import("./yellowcard-provider")
    vi.mocked(yellowcardPayoutProvider.supports).mockResolvedValueOnce(false)
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "mobile_money",
      providerRouting: [
        { provider: "yellowcard", priority: 1 },
        { provider: "noah", priority: 2 },
      ],
    }
    await expect(selectProvider(ctx)).rejects.toMatchObject({ code: "NO_PROVIDER_FOR_CORRIDOR" })
  })

  it("returns primary when it supports the corridor", async () => {
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "bank_transfer",
      providerRouting: [{ provider: "grid", priority: 1 }],
    }
    const provider = await selectProvider(ctx)
    expect(provider.id).toBe("grid")
  })

  it("throws when routing is empty", async () => {
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "bank_transfer",
      providerRouting: [],
    }
    await expect(selectProvider(ctx)).rejects.toMatchObject({ code: "NO_PROVIDER_FOR_CORRIDOR" })
  })

  it("throws when primary does not support", async () => {
    const { yellowcardPayoutProvider } = await import("./yellowcard-provider")
    vi.mocked(yellowcardPayoutProvider.supports).mockResolvedValueOnce(false)
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "bank_transfer",
      providerRouting: [{ provider: "yellowcard", priority: 1 }],
    }
    await expect(selectProvider(ctx)).rejects.toMatchObject({ code: "NO_PROVIDER_FOR_CORRIDOR" })
  })

  it("strips Grid for digital-asset sender and uses next provider", async () => {
    const ctx: CorridorContext = {
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      senderCountryCode: "MA",
      providerRouting: [
        { provider: "grid", priority: 1 },
        { provider: "noah", priority: 2 },
      ],
    }
    const provider = await selectProvider(ctx)
    expect(provider.id).toBe("noah")
  })

  it("fails closed when only Grid remains for digital-asset sender", async () => {
    const ctx: CorridorContext = {
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      senderCountryCode: "MA",
      providerRouting: [{ provider: "grid", priority: 1 }],
    }
    await expect(selectProvider(ctx)).rejects.toMatchObject({ code: "NO_PROVIDER_FOR_CORRIDOR" })
  })

  it("does not strip Grid for non-digital-asset sender", async () => {
    const ctx: CorridorContext = {
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
      senderCountryCode: "NG",
      providerRouting: [{ provider: "grid", priority: 1 }],
    }
    const provider = await selectProvider(ctx)
    expect(provider.id).toBe("grid")
  })
})

describe("filterProviderRoutingForSender", () => {
  it("removes grid for MA and keeps priority order", () => {
    const filtered = filterProviderRoutingForSender(
      [
        { provider: "grid", priority: 1 },
        { provider: "yellowcard", priority: 3 },
        { provider: "noah", priority: 2 },
      ],
      "MA",
    )
    expect(filtered.map((e) => e.provider)).toEqual(["noah", "yellowcard"])
  })
})
