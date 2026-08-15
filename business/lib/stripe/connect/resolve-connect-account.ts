import type { SupabaseClient } from "@supabase/supabase-js"
import { hasActiveVirtualAccountInDb } from "@/lib/noah/virtual-accounts-db"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import type { BusinessStripeConnectAccountRow, ConnectReadyStatus } from "./types"

export const CONNECT_KYB_REQUIRED_REASON =
  "Complete business verification first to set up online payments"

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
 * Requires: Tier-1 approved, Grid VA, transfers+payouts enabled, external account linked.
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
    .select("verification_status, verification_provider, grid_customer_id")
    .eq("id", businessId)
    .maybeSingle()

  const tier1Complete = isBusinessTier1Complete(biz)

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, businessId)
  const hasGridVa = ownerUserId
    ? await hasActiveVirtualAccountInDb(admin, {
        currency: fiat,
        userId: ownerUserId,
        businessId,
      })
    : false

  const row = await getConnectAccountRow(admin, businessId)
  const due = asDueList(row?.requirements_currently_due)
  const externalAccountLinked = Boolean(row?.stripe_external_account_id?.trim())
  const transfersEnabled = Boolean(row?.transfers_enabled)
  const payoutsEnabled = Boolean(row?.payouts_enabled)
  const detailsSubmitted = Boolean(row?.details_submitted)
  const stripeAccountId = row?.stripe_account_id?.trim() || null

  let reason: string | undefined
  if (!tier1Complete) {
    reason = CONNECT_KYB_REQUIRED_REASON
  } else if (!row) {
    reason = "Complete online payment setup"
  } else if (!hasGridVa) {
    reason = `Your Easner ${currency} account is needed before payouts can be linked`
  } else if (!detailsSubmitted || due.length > 0) {
    reason = "Complete online payment verification"
  } else if (!transfersEnabled) {
    reason = "Online payment transfers are not active yet"
  } else if (!payoutsEnabled) {
    reason = "Online payment payouts are not enabled yet"
  } else if (!externalAccountLinked) {
    reason = "Link your virtual account as the payout destination"
  }

  const ready =
    tier1Complete &&
    hasGridVa &&
    Boolean(row) &&
    detailsSubmitted &&
    due.length === 0 &&
    transfersEnabled &&
    payoutsEnabled &&
    externalAccountLinked

  return {
    ready,
    reason: ready ? undefined : reason,
    tier1Complete,
    stripeAccountId,
    onboardingStatus: row?.onboarding_status ?? null,
    transfersEnabled,
    payoutsEnabled,
    detailsSubmitted,
    externalAccountLinked,
    hasGridVa,
    requirementsCurrentlyDue: due,
  }
}
