import type { SupabaseClient } from "@supabase/supabase-js"
import { getStripe } from "../client"
import {
  mapPayoutDestinationSnapshot,
  type ConnectPayoutDestinationSnapshot,
} from "./map-stripe-account-snapshots"
import { getConnectAccountRow } from "./resolve-connect-account"

/** Pull default external payout bank from Stripe into payout_destination_snapshot. */
export async function syncPayoutDestinationSnapshot(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<ConnectPayoutDestinationSnapshot | null> {
  const currency = (input.currency || "USD").trim().toLowerCase()
  const row = await getConnectAccountRow(admin, input.businessId)
  if (!row?.stripe_account_id) return null

  const stripe = getStripe()
  const listed = await stripe.accounts.listExternalAccounts(row.stripe_account_id, {
    object: "bank_account",
    limit: 100,
  })
  const banks = listed.data.filter(
    (entry): entry is Extract<(typeof listed.data)[number], { object: "bank_account" }> =>
      entry.object === "bank_account",
  )
  const defaultBank =
    banks.find((bank) => bank.default_for_currency && String(bank.currency ?? "").toLowerCase() === currency) ??
    banks.find((bank) => bank.default_for_currency) ??
    null

  const snapshot = mapPayoutDestinationSnapshot(defaultBank)
  const now = new Date().toISOString()
  await admin
    .from("business_stripe_connect_accounts")
    .update({
      payout_destination_snapshot: snapshot,
      ...(snapshot?.stripeExternalAccountId
        ? { stripe_external_account_id: snapshot.stripeExternalAccountId }
        : {}),
      updated_at: now,
    })
    .eq("business_id", input.businessId)

  return snapshot
}
