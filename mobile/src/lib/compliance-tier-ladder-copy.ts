/**
 * Easner compliance tier ladder — B2C (mobile). Customer-facing only; no provider names.
 */

export type TierLadderTier = {
  tier: 1 | 2 | 3
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
        "USD and EUR bank accounts, pay-in and pay-out, and stablecoin flows.",
    },
    {
      tier: 2,
      title: "African banking",
      description:
        "NGN and regional pay-in and pay-out in local markets where we launch.",
    },
    {
      tier: 3,
      title: "Cards",
      description:
        "Your access to personal debit/credit cards for your online and physical payments.",
    },
  ],
}
