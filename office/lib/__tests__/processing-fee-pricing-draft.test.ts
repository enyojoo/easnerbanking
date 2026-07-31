import { describe, expect, it } from "vitest"
import { buildCryptoProcessingFeeDraft, buildFiatProcessingFeeDraft } from "@/lib/processing-fee-pricing-draft"
import type { ProcessingFeeScheduleRow } from "@/lib/processing-fee-schedule-api"

describe("buildFiatProcessingFeeDraft", () => {
  const catalog = [
    {
      country_code: "NG",
      country_name: "Nigeria",
      currency_code: "NGN",
      currency_name: "Naira",
    },
    {
      country_code: "KE",
      country_name: "Kenya",
      currency_code: "KES",
      currency_name: "Shilling",
    },
  ]

  it("fills defaults when no stored fees", () => {
    const draft = buildFiatProcessingFeeDraft(catalog, "fiat_bank", undefined)
    expect(draft).toHaveLength(2)
    expect(draft[0]).toMatchObject({
      scope: "fiat_bank",
      country_code: "NG",
      pay_in_bps: 100,
      pay_out_bps: 100,
      cross_border_bps: 100,
    })
  })

  it("merges stored fees by country and currency", () => {
    const stored: ProcessingFeeScheduleRow[] = [
      {
        scope: "fiat_bank",
        country_code: "NG",
        currency_code: "NGN",
        asset_code: null,
        pay_in_bps: 80,
        pay_out_bps: 90,
        cross_border_bps: 110,
      },
    ]
    const draft = buildFiatProcessingFeeDraft(catalog, "fiat_bank", stored)
    expect(draft[0]?.pay_in_bps).toBe(80)
    expect(draft[0]?.pay_out_bps).toBe(90)
    expect(draft[0]?.cross_border_bps).toBe(110)
    expect(draft[1]?.pay_in_bps).toBe(100)
  })
})

describe("buildCryptoProcessingFeeDraft", () => {
  const catalog = [
    { asset_code: "USDC", asset_name: "USD Coin" },
    { asset_code: "EURC", asset_name: "Euro Coin" },
  ]

  it("fills defaults when no stored fees", () => {
    const draft = buildCryptoProcessingFeeDraft(catalog, undefined)
    expect(draft).toHaveLength(2)
    expect(draft[0]).toMatchObject({
      scope: "crypto",
      asset_code: "USDC",
      pay_in_bps: 100,
      pay_out_bps: 100,
    })
  })

  it("merges stored fees by asset", () => {
    const stored: ProcessingFeeScheduleRow[] = [
      {
        scope: "crypto",
        country_code: null,
        currency_code: null,
        asset_code: "USDC",
        pay_in_bps: 75,
        pay_out_bps: 85,
        cross_border_bps: 100,
      },
    ]
    const draft = buildCryptoProcessingFeeDraft(catalog, stored)
    expect(draft[0]?.pay_in_bps).toBe(75)
    expect(draft[0]?.pay_out_bps).toBe(85)
    expect(draft[1]?.pay_in_bps).toBe(100)
  })
})
