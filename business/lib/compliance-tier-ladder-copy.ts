/**
 * Easner compliance tier ladder — B2B (business). Customer-facing only; no provider names.
 * Local rails are Tier 1 + NG supplement when YC is enabled — not a separate ladder step.
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
      description: "USD/EUR accounts, payments, and stablecoin flows.",
    },
    {
      tier: 2,
      title: "Cards",
      description: "Business cards for online and in-store payments.",
    },
    {
      tier: 3,
      title: "Online payments",
      description: "Accept card payments on invoices. Settled to your Easner balance.",
    },
  ],
}
