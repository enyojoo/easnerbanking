import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { autoLinkGridVaPayoutIfEligible } from "./auto-link-grid-va-payout"
import { syncConnectAccountRow } from "./sync-account-from-stripe"
import { syncPayoutDestinationSnapshot } from "./sync-payout-destination-snapshot"
import { getConnectAccountRow, resolveConnectReadyForCheckout } from "./resolve-connect-account"
import {
  connectReadyToStatusSnapshot,
  notifyOnlinePaymentsStatusChange,
} from "@/lib/notifications/online-payments-notify"

async function businessIdForStripeAccount(
  admin: SupabaseClient,
  stripeAccountId: string,
): Promise<string | null> {
  const { data: row } = await admin
    .from("business_stripe_connect_accounts")
    .select("business_id")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle()
  return row?.business_id ? String(row.business_id) : null
}

/** Full Connect account sync: Stripe Account row + payout reconcile + payout snapshot. */
export async function runConnectAccountSyncPipeline(
  admin: SupabaseClient,
  input: { businessId: string; stripeAccountId: string; account?: Stripe.Account },
): Promise<void> {
  const previousReady = await resolveConnectReadyForCheckout(admin, input.businessId).catch(
    () => null,
  )
  const previous = previousReady ? connectReadyToStatusSnapshot(previousReady) : null

  await syncConnectAccountRow(admin, input)

  const autoLink = await autoLinkGridVaPayoutIfEligible(admin, {
    businessId: input.businessId,
  })
  if (!autoLink.skipped && !autoLink.ok) {
    console.warn("[stripe-connect] payout reconcile failed:", autoLink.error)
  }

  await syncPayoutDestinationSnapshot(admin, { businessId: input.businessId })

  const nextReady = await resolveConnectReadyForCheckout(admin, input.businessId).catch(() => null)
  if (nextReady) {
    await notifyOnlinePaymentsStatusChange({
      admin,
      businessId: input.businessId,
      previous,
      next: connectReadyToStatusSnapshot(nextReady),
    }).catch((e) => console.warn("[stripe-connect] online payments notify (non-fatal):", e))
  }
}

export async function syncConnectAccountFromWebhook(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  const connectEventTypes = new Set([
    "account.updated",
    "account.external_account.created",
    "account.external_account.updated",
    "account.external_account.deleted",
    "capability.updated",
  ])
  if (!connectEventTypes.has(event.type)) {
    return { handled: false }
  }

  let stripeAccountId = typeof event.account === "string" ? event.account : ""
  if (!stripeAccountId && event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    stripeAccountId = account.id
  }

  if (!stripeAccountId) return { handled: false }

  const businessId = await businessIdForStripeAccount(admin, stripeAccountId)
  if (!businessId) {
    console.warn("[stripe-connect] connect webhook for unknown account", event.type, stripeAccountId)
    return { handled: false }
  }

  const account =
    event.type === "account.updated" ? (event.data.object as Stripe.Account) : undefined

  await runConnectAccountSyncPipeline(admin, {
    businessId,
    stripeAccountId,
    account,
  })

  return { handled: true }
}

/** Resolve business id after discovery/link for webhook-less first sync. */
export async function syncConnectAccountIfLinked(
  admin: SupabaseClient,
  businessId: string,
): Promise<void> {
  const row = await getConnectAccountRow(admin, businessId)
  if (!row?.stripe_account_id) return
  await runConnectAccountSyncPipeline(admin, {
    businessId,
    stripeAccountId: row.stripe_account_id,
  })
}
