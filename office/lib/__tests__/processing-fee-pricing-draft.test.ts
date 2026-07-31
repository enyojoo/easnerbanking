import { describe, expect, it } from "vitest"
import { buildFiatProcessingFeeDraft } from "@/lib/processing-fee-pricing-draft"
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
