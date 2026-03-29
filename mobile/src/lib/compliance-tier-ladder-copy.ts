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
        "USD and EUR accounts, pay-in and pay-out, and stablecoin flows, plus other currency accounts where supported for your account.",
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
        "Personal credit cards when you finish the steps for your card program. Debit or prepaid if credit is not offered in your market.",
    },
  ],
}
