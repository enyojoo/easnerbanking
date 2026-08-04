import type { SupabaseClient } from "@supabase/supabase-js"
import { hasActiveVirtualAccountInDb } from "@/lib/noah/virtual-accounts-db"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { BusinessStripeConnectAccountRow, ConnectReadyStatus } from "./types"

function asDueList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === "string")
}

export async function getConnectAccountRow(
  admin: SupabaseClient,
  businessId: string,
): Promise<BusinessStripeConnectAccountRow | null> {
  const { data } = await admin
    .from("business_stripe_connect_accounts")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle()
  return (data as BusinessStripeConnectAccountRow | null) ?? null
}

/**
 * Whether the business can accept Pay online via Connect destination charges.
 * Requires: Tier-1, Grid VA, transfers+payouts enabled, external account linked.
 */
export async function resolveConnectReadyForCheckout(
  admin: SupabaseClient,
  businessId: string,
  opts?: { currency?: string },
): Promise<ConnectReadyStatus> {
  const currency = (opts?.currency || "USD").trim().toUpperCase()
  const fiat = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"

  const { data: biz } = await admin
    .from("businesses")
    .select("verification_status, verification_provider, noah_kyb_status, grid_customer_id")
    .eq("id", businessId)
    .maybeSingle()

  if (!isBusinessTier1Complete(biz)) {
    return {
      ready: false,
      reason: "Business verification is required before accepting online payments",
      stripeAccountId: null,
      onboardingStatus: null,
      transfersEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      externalAccountLinked: false,
      hasGridVa: false,
      requirementsCurrentlyDue: [],
    }
  }

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, businessId)
  const hasGridVa = ownerUserId
    ? await hasActiveVirtualAccountInDb(admin, {
        currency: fiat,
        userId: ownerUserId,
        businessId,
      })
    : false

  const row = await getConnectAccountRow(admin, businessId)
  if (!row) {
    return {
      ready: false,
      reason: "Complete online payment setup in Settings",
      stripeAccountId: null,
      onboardingStatus: null,
      transfersEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      externalAccountLinked: false,
      hasGridVa,
      requirementsCurrentlyDue: [],
    }
  }

  const due = asDueList(row.requirements_currently_due)
  const externalAccountLinked = Boolean(row.stripe_external_account_id?.trim())
  const transfersEnabled = Boolean(row.transfers_enabled)
  const payoutsEnabled = Boolean(row.payouts_enabled)
  const detailsSubmitted = Boolean(row.details_submitted)

  let reason: string | undefined
  if (!hasGridVa) {
    reason = "An active virtual account is required for payout settlement"
  } else if (!detailsSubmitted || due.length > 0) {
    reason = "Complete Stripe verification in Settings → Invoicing"
  } else if (!transfersEnabled) {
    reason = "Transfers capability is not active yet"
  } else if (!payoutsEnabled) {
    reason = "Payouts are not enabled yet"
  } else if (!externalAccountLinked) {
    reason = "Link your Grid virtual account as the payout destination"
  }

  const ready =
    hasGridVa &&
    detailsSubmitted &&
    due.length === 0 &&
    transfersEnabled &&
    payoutsEnabled &&
    externalAccountLinked

  return {
    ready,
    reason: ready ? undefined : reason,
    stripeAccountId: row.stripe_account_id,
    onboardingStatus: row.onboarding_status,
    transfersEnabled,
    payoutsEnabled,
    detailsSubmitted,
    externalAccountLinked,
    hasGridVa,
    requirementsCurrentlyDue: due,
  }
}
