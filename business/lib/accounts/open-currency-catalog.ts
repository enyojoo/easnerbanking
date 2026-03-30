import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"

export type AccountCurrencyOffer = {
  code: string
  label: string
  /** Internal routing — not shown to end users */
  provider: "noah" | "tier2"
  tierRequired: 1 | 2
  /** If set, currency cannot be opened yet */
  disabledReason?: string
}

const LABELS: Record<string, string> = {
  GBP: "British Pound",
  NGN: "Nigerian Naira",
}

/**
 * Currencies the user may add beyond default USD/EUR (Noah Tier 1 vs Tier 2 placeholders).
 */
export function buildOpenCurrencyCatalog(): AccountCurrencyOffer[] {
  const tier2Ok = TIER2_COMPLETE_PLACEHOLDER

  return [
    {
      code: "GBP",
      label: LABELS.GBP,
      provider: "noah",
      tierRequired: 1,
    },
    {
      code: "NGN",
      label: LABELS.NGN,
      provider: "tier2",
      tierRequired: 2,
      disabledReason: tier2Ok ? undefined : "African banking verification is required for this currency.",
    },
  ]
}
