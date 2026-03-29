/**
 * Easner compliance tier ladder — B2B (business web). Customer-facing only; no provider names.
 */

export type TierLadderTier = {
  tier: 1 | 2 | 3
  title: string
  description: string
  footnote?: string
}

export const BUSINESS_TIER_LADDER: { tiers: TierLadderTier[] } = {
  tiers: [
    {
      tier: 1,
      title: "Global banking",
      description:
        "USD and EUR bank accounts, pay-in and pay-out, and stablecoin flows, plus other currency accounts where supported for your organization.",
    },
    {
      tier: 2,
      title: "African banking",
      description:
        "NGN and regional pay-in and pay-out for your business operations where we launch—local African banking for your organization.",
    },
    {
      tier: 3,
      title: "Cards",
      description:
        "Your access to corporate debit/credit cards for your business needs, spend controls, and cardholder management when approved.",
    },
  ],
}
