/**
 * Easner compliance tier ladder – B2C (mobile). Customer-facing only; no provider names.
 * Local NGN rails are Tier 1 + NG supplement when YC is enabled – not a separate ladder step.
 */

export type TierLadderTier = {
  tier: 1 | 2
  title: string
  description: string
  footnote?: string
}

export const CONSUMER_TIER_LADDER: { tiers: TierLadderTier[] } = {
  tiers: [
    {
      tier: 1,
      title: "Global banking",
      description:
        "USD/EUR accounts, payments, and stablecoin flows.",
    },
    {
      tier: 2,
      title: "Cards",
      description:
        "Personal debit/credit cards for your online and physical payments.",
    },
  ],
}
