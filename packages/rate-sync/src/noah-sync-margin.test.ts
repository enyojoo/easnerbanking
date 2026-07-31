import { describe, expect, it, vi } from "vitest"
import { syncNoahRatesToSupabase } from "./noah-sync-to-supabase"

const upsertMock = vi.fn().mockResolvedValue({ error: null })

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            from_currency: "USD",
            to_currency: "NGN",
            source: "office",
            fee_type: "free",
            fee_amount: 0,
            min_amount: null,
            max_amount: null,
            margin_bps: 75,
          },
        ],
        error: null,
      }),
      upsert: upsertMock,
    })),
  })),
}))

describe("syncNoahRatesToSupabase margin preservation", () => {
  it("keeps existing margin_bps and recomputes rate from mid", async () => {
    upsertMock.mockClear()
    await syncNoahRatesToSupabase({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      inputs: [{ from_currency: "USD", to_currency: "NGN", noah_mid: 1500, country_code: "NG" }],
      margin: 0.005,
    })

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const payload = upsertMock.mock.calls[0]?.[0]?.[0] as Record<string, unknown>
    expect(payload.margin_bps).toBe(75)
    expect(Number(payload.rate)).toBeCloseTo(1500 * (1 - 75 / 10_000), 8)
  })
})
