import type {
  ProcessingFeeScheduleRow,
  ProcessingFeeScheduleScope,
} from "@/lib/processing-fee-schedule-api"

const DEFAULT_BPS = 100

export type FiatPricingCatalogRow = {
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
}

export function buildFiatProcessingFeeDraft(
  catalog: FiatPricingCatalogRow[],
  scope: Extract<ProcessingFeeScheduleScope, "fiat_bank" | "fiat_mobile_money">,
  stored: ProcessingFeeScheduleRow[] | undefined,
): ProcessingFeeScheduleRow[] {
  const byKey = new Map<string, ProcessingFeeScheduleRow>()
  for (const row of stored ?? []) {
    const cc = String(row.country_code ?? "").trim().toUpperCase()
    const cur = String(row.currency_code ?? "").trim().toUpperCase()
    if (cc && cur) byKey.set(`${cc}:${cur}`, row)
  }

  return catalog.map((item) => {
    const key = `${item.country_code}:${item.currency_code}`
    const existing = byKey.get(key)
    return {
      id: existing?.id,
      scope,
      country_code: item.country_code,
      currency_code: item.currency_code,
      asset_code: null,
      country_name: item.country_name,
      currency_name: item.currency_name,
      pay_in_bps: existing?.pay_in_bps ?? DEFAULT_BPS,
      pay_out_bps: existing?.pay_out_bps ?? DEFAULT_BPS,
      cross_border_bps: existing?.cross_border_bps ?? DEFAULT_BPS,
      updated_at: existing?.updated_at,
    }
  })
}
