import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  clearProcessingFeeBpsCache,
  resolveCryptoProcessingFeeBps,
  resolveFiatProcessingFeeBps,
} from "@/lib/processing-fee/resolve-processing-fee-bps"
import { DEFAULT_PAYOUT_PROCESSING_FEE_BPS } from "@easner/shared"

type TableRow = Record<string, unknown> | null

function mockAdmin(tables: Record<string, TableRow>) {
  const from = vi.fn((table: string) => {
    const row = tables[table] ?? null
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    }
    return chain
  })
  return { from }
}

describe("resolve-processing-fee-bps", () => {
  beforeEach(() => {
    clearProcessingFeeBpsCache()
  })

  it("returns stored fiat pay_out bps from schedule", async () => {
    const admin = mockAdmin({
      processing_fee_schedule: { pay_in_bps: 80, pay_out_bps: 50, cross_border_bps: 60 },
    })
    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "GH",
      currencyCode: "GHS",
      direction: "pay_out",
    })
    expect(bps).toBe(50)
  })

  it("returns stored fiat cross_border bps from schedule", async () => {
    const admin = mockAdmin({
      processing_fee_schedule: { pay_in_bps: 80, pay_out_bps: 50, cross_border_bps: 60 },
    })
    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "GH",
      currencyCode: "GHS",
      direction: "cross_border",
    })
    expect(bps).toBe(60)
  })

  it("falls back to default when fiat schedule row missing", async () => {
    const admin = mockAdmin({ processing_fee_schedule: null })
    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "mobile_money",
      countryCode: "KE",
      currencyCode: "KES",
      direction: "pay_in",
    })
    expect(bps).toBe(DEFAULT_PAYOUT_PROCESSING_FEE_BPS)
  })

  it("returns stored crypto pay_out bps from schedule", async () => {
    const admin = mockAdmin({
      processing_fee_schedule: { pay_in_bps: 90, pay_out_bps: 75 },
    })
    const bps = await resolveCryptoProcessingFeeBps(admin as never, {
      assetCode: "USDC",
      direction: "pay_out",
    })
    expect(bps).toBe(75)
  })

  it("caches fiat schedule lookups within TTL", async () => {
    const admin = mockAdmin({
      processing_fee_schedule: { pay_in_bps: 100, pay_out_bps: 50, cross_border_bps: 100 },
    })
    await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "NG",
      currencyCode: "NGN",
      direction: "pay_out",
    })
    await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "NG",
      currencyCode: "NGN",
      direction: "pay_out",
    })
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it("user override wins over schedule", async () => {
    const admin = mockAdmin({
      processing_fee_overrides: { pay_in_bps: null, pay_out_bps: 0, cross_border_bps: null },
      processing_fee_schedule: { pay_in_bps: 100, pay_out_bps: 100, cross_border_bps: 100 },
    })
    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "NG",
      currencyCode: "NGN",
      direction: "pay_out",
      userId: "user-1",
    })
    expect(bps).toBe(0)
    expect(admin.from).not.toHaveBeenCalledWith("processing_fee_schedule")
  })

  it("falls through null user override to business override", async () => {
    const userId = "user-1"
    const businessId = "biz-1"
    let overrideCall = 0
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "processing_fee_overrides") {
          overrideCall += 1
          const row =
            overrideCall === 1
              ? { pay_in_bps: null, pay_out_bps: null, cross_border_bps: null }
              : { pay_in_bps: null, pay_out_bps: 25, cross_border_bps: null }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { pay_in_bps: 100, pay_out_bps: 100, cross_border_bps: 100 },
            error: null,
          }),
        }
      }),
    }

    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "NG",
      currencyCode: "NGN",
      direction: "pay_out",
      userId,
      businessId,
    })
    expect(bps).toBe(25)
  })

  it("loads business from user when businessId omitted", async () => {
    let overrideCall = 0
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { easner_business_id: "biz-99" },
              error: null,
            }),
          }
        }
        if (table === "processing_fee_overrides") {
          overrideCall += 1
          const row =
            overrideCall === 1
              ? { pay_in_bps: null, pay_out_bps: null, cross_border_bps: null }
              : { pay_in_bps: 0, pay_out_bps: null, cross_border_bps: null }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
    }

    const bps = await resolveFiatProcessingFeeBps(admin as never, {
      rail: "bank_transfer",
      countryCode: "NG",
      currencyCode: "NGN",
      direction: "pay_in",
      userId: "user-1",
    })
    expect(bps).toBe(0)
  })
})
