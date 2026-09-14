import { beforeEach, describe, expect, it, vi } from "vitest"

const from = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from }),
}))

import {
  ensureCurrencyUsable,
  getAllowedBaseCurrencyOptions,
  isAllowedBaseCurrency,
} from "./currency-controls"

function mockActive(values: Record<string, string>) {
  from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: Object.entries(values).map(([key, value]) => ({ key, value })),
        error: null,
      }),
    }),
  })
}

describe("currency-controls USD/EUR", () => {
  beforeEach(() => {
    from.mockReset()
  })

  it("lists only active USD and EUR", async () => {
    mockActive({ currency_active_USD: "true", currency_active_EUR: "false" })
    await expect(getAllowedBaseCurrencyOptions()).resolves.toEqual([
      { code: "USD", label: "USD - US Dollar" },
    ])
    await expect(isAllowedBaseCurrency("EUR")).resolves.toBe(false)
    await expect(isAllowedBaseCurrency("GBP")).resolves.toBe(false)
  })

  it("rejects inactive USD/EUR on open", async () => {
    mockActive({ currency_active_USD: "false", currency_active_EUR: "true" })
    await expect(ensureCurrencyUsable("USD")).resolves.toEqual({
      ok: false,
      reason: "USD is temporarily unavailable.",
    })
    await expect(ensureCurrencyUsable("EUR")).resolves.toEqual({ ok: true })
  })

  it("defaults both to active when unset", async () => {
    mockActive({})
    const options = await getAllowedBaseCurrencyOptions()
    expect(options.map((o) => o.code)).toEqual(["USD", "EUR"])
  })
})
