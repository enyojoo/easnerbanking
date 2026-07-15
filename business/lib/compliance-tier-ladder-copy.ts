/**
 * Easner compliance tier ladder — B2B (business). Customer-facing only; no provider names.
 * Local rails are Tier 1 + NG supplement when YC is enabled — not a separate ladder step.
 */

export type TierLadderTier = {
  tier: 1 | 2
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
        "USD and EUR business accounts, pay-in and pay-out, stablecoin flows, and local currency deposits where available.",
    },
    {
      tier: 2,
      title: "Cards",
      description:
        "Business debit/credit cards for online and physical payments.",
    },
  ],
}
