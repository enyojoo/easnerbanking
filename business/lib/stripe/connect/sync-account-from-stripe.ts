import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "../client"
import { autoLinkGridVaPayoutIfEligible } from "./auto-link-grid-va-payout"
import type { BusinessStripeConnectAccountRow, ConnectOnboardingStatus } from "./types"

function capabilityActive(
  caps: Stripe.Account.Capabilities | null | undefined,
  key: keyof Stripe.Account.Capabilities,
): boolean {
  return String(caps?.[key] ?? "") === "active"
}

function deriveOnboardingStatus(account: Stripe.Account): ConnectOnboardingStatus {
  if (account.requirements?.disabled_reason) return "disabled"
  const currentlyDue = account.requirements?.currently_due ?? []
  if (currentlyDue.length > 0) return "restricted"
  if (account.details_submitted && capabilityActive(account.capabilities, "transfers")) {
    return "active"
  }
  if (account.details_submitted) return "restricted"
  return "pending"
}

export function mapStripeAccountToRowPatch(account: Stripe.Account): {
  onboarding_status: ConnectOnboardingStatus
  charges_enabled: boolean
  payouts_enabled: boolean
  transfers_enabled: boolean
  details_submitted: boolean
  requirements_currently_due: string[]
  capabilities: Record<string, string>
  stripe_payout_schedule: Record<string, unknown> | null
} {
  const caps = account.capabilities
  return {
    onboarding_status: deriveOnboardingStatus(account),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    transfers_enabled: capabilityActive(caps, "transfers"),
    details_submitted: Boolean(account.details_submitted),
    requirements_currently_due: [...(account.requirements?.currently_due ?? [])],
    capabilities: {
      transfers: String(caps?.transfers ?? "inactive"),
      card_payments: String(caps?.card_payments ?? "inactive"),
    },
    stripe_payout_schedule: account.settings?.payouts?.schedule
      ? (account.settings.payouts.schedule as unknown as Record<string, unknown>)
      : null,
  }
}

/** Persist Stripe Account fields onto business_stripe_connect_accounts. */
export async function syncConnectAccountRow(
  admin: SupabaseClient,
  input: { businessId: string; stripeAccountId: string; account?: Stripe.Account },
): Promise<BusinessStripeConnectAccountRow> {
  const stripe = getStripe()
  const account =
    input.account ?? (await stripe.accounts.retrieve(input.stripeAccountId))
  const patch = mapStripeAccountToRowPatch(account)
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from("business_stripe_connect_accounts")
    .upsert(
      {
        business_id: input.businessId,
        stripe_account_id: account.id,
        ...patch,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "business_id" },
    )
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(error?.message || "Failed to sync Connect account row")
  }
  return data as BusinessStripeConnectAccountRow
}

/** Webhook: account.updated — resolve business by stripe_account_id and sync. */
export async function syncConnectAccountFromWebhook(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  if (event.type !== "account.updated") return { handled: false }

  const account = event.data.object as Stripe.Account
  const accountId = account.id || (typeof event.account === "string" ? event.account : "")
  if (!accountId) return { handled: false }

  const { data: row } = await admin
    .from("business_stripe_connect_accounts")
    .select("business_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle()

  if (!row?.business_id) {
    console.warn("[stripe-connect] account.updated for unknown account", accountId)
    return { handled: false }
  }

  await syncConnectAccountRow(admin, {
    businessId: String(row.business_id),
    stripeAccountId: accountId,
    account,
  })

  const autoLink = await autoLinkGridVaPayoutIfEligible(admin, {
    businessId: String(row.business_id),
  })
  if (!autoLink.skipped && !autoLink.ok) {
    console.warn("[stripe-connect] auto-link after account.updated failed:", autoLink.error)
  }

  return { handled: true }
}
