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
        "USD and EUR bank accounts, pay-in and pay-out, stablecoin flows, and local currency deposits where available.",
    },
    {
      tier: 2,
      title: "Cards",
      description:
        "Your access to personal debit/credit cards for your online and physical payments.",
    },
  ],
}
