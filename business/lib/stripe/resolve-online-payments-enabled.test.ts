import { describe, expect, it, vi } from "vitest"
import { resolveOnlinePaymentsEnabled } from "./resolve-online-payments-enabled"

function mockAdmin(row: { online_payments_enabled?: boolean } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row })),
        })),
      })),
    })),
  }
}

describe("resolveOnlinePaymentsEnabled", () => {
  it("defaults to enabled when no checkout settings row exists", async () => {
    const admin = mockAdmin(null)
    const result = await resolveOnlinePaymentsEnabled(admin as never, "biz-1")
    expect(result.enabled).toBe(true)
  })

  it("returns enabled when online_payments_enabled is true", async () => {
    const admin = mockAdmin({ online_payments_enabled: true })
    const result = await resolveOnlinePaymentsEnabled(admin as never, "biz-1")
    expect(result.enabled).toBe(true)
  })

  it("returns disabled when online_payments_enabled is false", async () => {
    const admin = mockAdmin({ online_payments_enabled: false })
    const result = await resolveOnlinePaymentsEnabled(admin as never, "biz-1")
    expect(result.enabled).toBe(false)
  })
})
