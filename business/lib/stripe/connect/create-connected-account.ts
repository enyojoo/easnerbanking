import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessCountryIso2 } from "@/lib/grid/business-profile-shell"
import {
  connectReadyToStatusSnapshot,
  notifyOnlinePaymentsStatusChange,
} from "@/lib/notifications/online-payments-notify"
import { getStripe } from "../client"
import {
  clearStaleConnectAccountRow,
  isStripeConnectAccountInaccessibleError,
} from "./account-access"
import { ensureConnectAccountLinked } from "./discover-connect-account"
import { resolveConnectReadyForCheckout } from "./resolve-connect-account"
import { syncConnectAccountRow } from "./sync-account-from-stripe"
import type { BusinessStripeConnectAccountRow } from "./types"

/**
 * Create (or return existing) Stripe Connect account for a business.
 * Platform MoR destination charges: transfers capability, no Stripe Dashboard.
 */
export async function ensureConnectedAccount(
  admin: SupabaseClient,
  input: { businessId: string; email?: string | null },
): Promise<BusinessStripeConnectAccountRow> {
  const { data: existing } = await admin
    .from("business_stripe_connect_accounts")
    .select("*")
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (existing?.stripe_account_id) {
    try {
      return await syncConnectAccountRow(admin, {
        businessId: input.businessId,
        stripeAccountId: String(existing.stripe_account_id),
      })
    } catch (e) {
      if (!isStripeConnectAccountInaccessibleError(e)) throw e
      console.warn(
        "[stripe-connect] stored account is inaccessible; creating a new Connect account",
        existing.stripe_account_id,
      )
      await clearStaleConnectAccountRow(admin, input.businessId)
    }
  }

  const linked = await ensureConnectAccountLinked(admin, input.businessId)
  if (linked) return linked

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id,name,easetag,country,support_email,website,business_type")
    .eq("id", input.businessId)
    .maybeSingle()

  if (bizErr || !biz?.id) {
    throw new Error(bizErr?.message || "Business not found")
  }

  const country = resolveBusinessCountryIso2(biz.country as string | null) || "US"
  const email =
    input.email?.trim() ||
    (typeof biz.support_email === "string" ? biz.support_email.trim() : "") ||
    undefined

  const stripe = getStripe()
  const account = await stripe.accounts.create({
    country,
    email: email || undefined,
    business_type: "company",
    company: {
      name: typeof biz.name === "string" && biz.name.trim() ? biz.name.trim() : undefined,
    },
    business_profile: {
      name: typeof biz.name === "string" && biz.name.trim() ? biz.name.trim() : undefined,
      url: typeof biz.website === "string" && biz.website.trim() ? biz.website.trim() : undefined,
      product_description: "Invoice payments settled to Easner wallet via virtual account",
    },
    metadata: {
      easner_business_id: input.businessId,
      easner_easetag: typeof biz.easetag === "string" ? biz.easetag : "",
    },
    // Platform MoR: platform liable for losses; no seller Stripe Dashboard.
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "none" },
      requirement_collection: "application",
    },
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: "daily" },
      },
    },
  })

  const now = new Date().toISOString()
  const { error: insertErr } = await admin.from("business_stripe_connect_accounts").insert({
    business_id: input.businessId,
    stripe_account_id: account.id,
    onboarding_status: "pending",
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    transfers_enabled: false,
    details_submitted: Boolean(account.details_submitted),
    default_settlement_rail: "grid_va",
    created_at: now,
    updated_at: now,
  })

  if (insertErr) {
    // Race: another request inserted first
    if (insertErr.code === "23505") {
      const { data: raced } = await admin
        .from("business_stripe_connect_accounts")
        .select("*")
        .eq("business_id", input.businessId)
        .maybeSingle()
      if (raced?.stripe_account_id) {
        return syncConnectAccountRow(admin, {
          businessId: input.businessId,
          stripeAccountId: String(raced.stripe_account_id),
        })
      }
    }
    throw new Error(insertErr.message)
  }

  const row = await syncConnectAccountRow(admin, {
    businessId: input.businessId,
    stripeAccountId: account.id,
    account,
  })

  const nextReady = await resolveConnectReadyForCheckout(admin, input.businessId).catch(() => null)
  if (nextReady) {
    await notifyOnlinePaymentsStatusChange({
      admin,
      businessId: input.businessId,
      previous: null,
      next: connectReadyToStatusSnapshot(nextReady),
    }).catch((e) => console.warn("[stripe-connect] setup email (non-fatal):", e))
  }

  return row
}
