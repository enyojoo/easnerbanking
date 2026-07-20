import { describe, expect, it, vi, beforeEach } from "vitest"

const upsertMock = vi.fn()
const deleteEqMock = vi.fn()

vi.mock("@supabase/supabase-js", () => {
  const existing = [
    { from_currency: "USDC", to_currency: "NGN", source: "yc_rates_sync" },
    { from_currency: "ADA", to_currency: "USDC", source: "yc_rates_sync" },
    { from_currency: "USD", to_currency: "NGN", source: "yc_rates_sync" },
  ]
  return {
    createClient: () => ({
      from: () => ({
        select: () => Promise.resolve({ data: existing, error: null }),
        upsert: (...args: unknown[]) => {
          upsertMock(...args)
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          eq: () => ({
            eq: () => {
              deleteEqMock()
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }),
    }),
  }
})

import { syncYcRatesToSupabase } from "./yc-sync-to-supabase"

describe("syncYcRatesToSupabase", () => {
  beforeEach(() => {
    upsertMock.mockClear()
    deleteEqMock.mockClear()
  })

  it("writes USD→local and local→USDC only (no USDC→local)", async () => {
    const result = await syncYcRatesToSupabase({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      currencies: [{ currency: "NGN", yc_buy: 1500, yc_sell: 1520 }],
      crossPairs: [],
      allowlist: new Set(["NGN"]),
    })

    expect(upsertMock).toHaveBeenCalled()
    const rows = upsertMock.mock.calls[0]![0] as Array<{
      from_currency: string
      to_currency: string
      rate: number
    }>
    const keys = rows.map((r) => `${r.from_currency}_${r.to_currency}`).sort()
    expect(keys).toEqual(["NGN_USDC", "USD_NGN"])
    expect(rows.find((r) => r.from_currency === "USD")?.rate).toBeCloseTo(1520 * 0.995, 5)
    expect(rows.find((r) => r.to_currency === "USDC")?.rate).toBeCloseTo(1500 / 0.995, 5)
    expect(result.updated).toBe(2)
    expect(result.pruned).toBeGreaterThanOrEqual(2)
  })

  it("writes cross pairs when both legs present", async () => {
    await syncYcRatesToSupabase({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      currencies: [
        { currency: "NGN", yc_buy: 1500, yc_sell: 1520 },
        { currency: "KES", yc_buy: 130, yc_sell: 132 },
      ],
      crossPairs: [
        { from_currency: "NGN", to_currency: "KES" },
        { from_currency: "KES", to_currency: "NGN" },
      ],
      allowlist: new Set(["NGN", "KES"]),
    })

    const rows = upsertMock.mock.calls[0]![0] as Array<{
      from_currency: string
      to_currency: string
    }>
    const keys = new Set(rows.map((r) => `${r.from_currency}_${r.to_currency}`))
    expect(keys.has("USD_NGN")).toBe(true)
    expect(keys.has("USD_KES")).toBe(true)
    expect(keys.has("NGN_USDC")).toBe(true)
    expect(keys.has("KES_USDC")).toBe(true)
    expect(keys.has("NGN_KES")).toBe(true)
    expect(keys.has("KES_NGN")).toBe(true)
    expect(keys.has("USDC_NGN")).toBe(false)
  })
})
