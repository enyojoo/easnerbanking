/**
 * Tier 1 (Easner) — engineering spike: align product/UI with confirmed provider rails.
 *
 * **Customer-facing copy** must stay Easner-branded (no provider names). Internal code may keep `noah_*` identifiers.
 *
 * ## Noah documentation — Tier 1 fiat scope
 *
 * - [Hosted Onboarding](https://docs.noah.com/recipes/onboarding/hosted-onboarding)
 * - [Choosing your onboarding method](https://docs.noah.com/recipes/onboarding/choosing-onboarding-method)
 * - API: Standard Model hosted session — see Noah API reference for `POST .../onboarding/:CustomerID`
 * - Noah’s **current fiat payment methods** (per their docs) are **USD and EUR**. That matches our default
 *   `FiatOptions` in `buildHostedOnboardingBody` (USD + EUR).
 * - **GBP:** Not in Noah’s documented current fiat set — treat as **future Noah enablement** or a **separate provider**
 *   if you need UK rails before Noah offers them. Do not promise GBP in customer copy until one of those paths is live.
 *
 * ## user-noah MCP — tools to cross-check against integration
 *
 * - `post_onboarding_by_id` — `CustomerID`, `ReturnURL`, `FiatOptions[]` (`FiatCurrencyCode` per item);
 *   optional `CustomerType` `Individual` | `Business` (defaults Individual).
 * - `post_onboarding_prefill` — optional KYB prefill before hosted session (business recipes).
 * - `get_customers_by_id` / `get_customers` — customer state after onboarding.
 * - Checkout / bank workflows: `post_checkout_payin_fiat`, `post_checkout_payout_fiat`, hosted workflow helpers as
 *   applicable to your product surface.
 *
 * **Schema note:** `FiatCurrencyCode` may list many currencies (including NGN). In Easner product framing, **African
 * banking / NGN** is **Tier 2**, not Tier 1 — do not bundle Tier 2 corridors into Tier 1 marketing or entitlement
 * checks solely because they appear in API enums.
 *
 * ## Business web hosted UI
 *
 * - `BusinessVerificationSection` (`components/compliance/business-verification-section.tsx`) loads HostedURL in a dialog
 *   **iframe**. If embedding is blocked (`X-Frame-Options` / CSP), users may need to adjust flow (e.g. product revisit
 *   full-page redirect) — the dialog does not expose extra fallback buttons.
 *
 * ## App alignment (this codebase)
 *
 * - **Mobile Tier 1 complete:** `users.noah_kyc_status === 'approved'` (see `mobile/src/lib/compliance.ts`,
 *   `AccountVerificationScreen`, send guards).
 * - **Business web Tier 1 complete:** `tier1Complete` from profile API — org `noah_kyb_status === 'approved'` on
 *   `businesses` (see `GET /api/business/profile`, `business-profile-store`).
 *
 * Use `TIER1_ENTITLEMENTS_REFERENCE` only as a checklist for engineering; do not surface provider names to users.
 */

export const NOAH_DOCS_TIER1_REFERENCE = {
  hostedOnboarding: "https://docs.noah.com/recipes/onboarding/hosted-onboarding",
  choosingOnboardingMethod: "https://docs.noah.com/recipes/onboarding/choosing-onboarding-method",
} as const

/** MCP tool names (user-noah) relevant to hosted onboarding and customer state — confirm parameters in MCP schema. */
export const USER_NOAH_MCP_TOOLS_TIER1 = [
  "post_onboarding_by_id",
  "post_onboarding_prefill",
  "get_customers_by_id",
  "get_customers",
] as const

export const TIER1_ENTITLEMENTS_REFERENCE = {
  label: "Easner Tier 1 — global banking & stablecoin (provider-backed)",
  confirmAgainst: [
    "Noah docs: hosted onboarding + choosing onboarding method (links in NOAH_DOCS_TIER1_REFERENCE)",
    "Noah docs: current fiat payment methods USD/EUR; GBP only when Noah adds it or via another integration",
    "Virtual account / payout product docs for exact rails",
    "user-noah MCP: post_onboarding_by_id FiatOptions vs product Tier 1 bundle",
  ],
  gbpNote:
    "Noah current scope is USD/EUR per docs; GBP is TBD (Noah later) or another provider — do not promise GBP in UI until shipped.",
  tier2BoundaryNote:
    "NGN / African banking is Tier 2 in Easner framing even if fiat enums include those codes.",
} as const
