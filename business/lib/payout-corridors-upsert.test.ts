import { describe, expect, it, vi } from "vitest"
import { upsertPayoutCorridor } from "./payout-corridors-upsert"

function mockAdmin(existing: { id: string; provider_routing?: unknown } | null) {
  const updatePayloads: Record<string, unknown>[] = []
  const insertPayloads: Record<string, unknown>[] = []

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayloads.push(payload)
      return chain
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertPayloads.push(payload)
      return chain
    }),
  }

  return {
    admin: { from: vi.fn(() => chain) } as unknown as Parameters<typeof upsertPayoutCorridor>[0],
    updatePayloads,
    insertPayloads,
  }
}

describe("upsertPayoutCorridor", () => {
  it("preserves provider_routing on existing rows by default", async () => {
    const { admin, updatePayloads } = mockAdmin({
      id: "row-1",
      provider_routing: [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }],
    })

    const result = await upsertPayoutCorridor(admin, {
      rail: "bank_transfer",
      country_code: "NG",
      country_name: "Nigeria",
      currency_code: "NGN",
      currency_name: "Nigerian Naira",
      provider_routing: [{ provider: "noah", priority: 1, settlement_asset: "USDC" }],
    })

    expect(result.ok).toBe(true)
    expect(updatePayloads[0]).not.toHaveProperty("provider_routing")
  })

  it("overwrites provider_routing when explicitly requested", async () => {
    const { admin, updatePayloads } = mockAdmin({
      id: "row-1",
      provider_routing: [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }],
    })

    const routing = [{ provider: "noah", priority: 1, settlement_asset: "USDC" }]
    const result = await upsertPayoutCorridor(
      admin,
      {
        rail: "bank_transfer",
        country_code: "NG",
        country_name: "Nigeria",
        currency_code: "NGN",
        currency_name: "Nigerian Naira",
        provider_routing: routing,
      },
      { overwriteProviderRouting: true },
    )

    expect(result.ok).toBe(true)
    expect(updatePayloads[0]?.provider_routing).toEqual(routing)
  })

  it("sets provider_routing on insert", async () => {
    const { admin, insertPayloads } = mockAdmin(null)
    const routing = [{ provider: "yellowcard", priority: 1, settlement_asset: "USDC" }]

    const result = await upsertPayoutCorridor(admin, {
      rail: "bank_transfer",
      country_code: "NG",
      country_name: "Nigeria",
      currency_code: "NGN",
      currency_name: "Nigerian Naira",
      provider_routing: routing,
    })

    expect(result.ok).toBe(true)
    expect(insertPayloads[0]?.provider_routing).toEqual(routing)
  })
})
