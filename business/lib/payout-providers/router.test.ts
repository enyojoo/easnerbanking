import { describe, expect, it, vi } from "vitest"
import { selectProvider } from "./router"
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
    supports: vi.fn(async () => false),
  },
}))

describe("selectProvider", () => {
  it("picks first routing entry that supports the corridor", async () => {
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "mobile_money",
      providerRouting: [
        { provider: "yellowcard", priority: 1 },
        { provider: "noah", priority: 2 },
      ],
    }
    const provider = await selectProvider(ctx)
    expect(provider.id).toBe("noah")
  })

  it("throws when no provider supports", async () => {
    const ctx: CorridorContext = {
      countryCode: "KE",
      currencyCode: "KES",
      rail: "bank_transfer",
      providerRouting: [{ provider: "yellowcard", priority: 1 }],
    }
    await expect(selectProvider(ctx)).rejects.toMatchObject({ code: "NO_PROVIDER_FOR_CORRIDOR" })
  })
})
