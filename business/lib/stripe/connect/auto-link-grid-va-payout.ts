import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { hasActiveVirtualAccountInDb } from "@/lib/noah/virtual-accounts-db"
import { linkGridVaExternalAccount } from "./link-grid-va-external-account"
import { getConnectAccountRow } from "./resolve-connect-account"

export type AutoLinkGridVaSkipReason =
  | "already_linked"
  | "no_connect_account"
  | "details_not_submitted"
  | "no_grid_va"

export type AutoLinkGridVaResult =
  | { skipped: true; reason: AutoLinkGridVaSkipReason }
  | {
      skipped: false
      ok: true
      stripeExternalAccountId: string
      maskedDestination: string
    }
  | { skipped: false; ok: false; error: string }

/**
 * Register the business Grid VA as Stripe payout destination when onboarding
 * is far enough along. Idempotent — no-op when already linked or not eligible.
 */
export async function autoLinkGridVaPayoutIfEligible(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<AutoLinkGridVaResult> {
  const row = await getConnectAccountRow(admin, input.businessId)
  if (!row?.stripe_account_id) {
    return { skipped: true, reason: "no_connect_account" }
  }
  if (row.stripe_external_account_id?.trim()) {
    return { skipped: true, reason: "already_linked" }
  }
  if (!row.details_submitted) {
    return { skipped: true, reason: "details_not_submitted" }
  }

  const currency = (input.currency || "USD").trim().toUpperCase()
  const fiat = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"
  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, input.businessId)
  const hasGridVa = ownerUserId
    ? await hasActiveVirtualAccountInDb(admin, {
        currency: fiat,
        userId: ownerUserId,
        businessId: input.businessId,
      })
    : false
  if (!hasGridVa) {
    return { skipped: true, reason: "no_grid_va" }
  }

  const result = await linkGridVaExternalAccount(admin, {
    businessId: input.businessId,
    currency,
  })
  if (!result.ok) {
    return { skipped: false, ok: false, error: result.error }
  }

  return {
    skipped: false,
    ok: true,
    stripeExternalAccountId: result.stripeExternalAccountId,
    maskedDestination: result.maskedDestination,
  }
}
