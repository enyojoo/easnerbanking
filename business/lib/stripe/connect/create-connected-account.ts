import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveBusinessCountryIso2 } from "@/lib/grid/business-profile-shell"
import {
  connectReadyToStatusSnapshot,
  notifyOnlinePaymentsStatusChange,
} from "@/lib/notifications/online-payments-notify"
import { getStripe } from "../client"
import { buildConnectedAccountStatementDescriptor } from "../statement-descriptor"
import { ensureConnectAccountLinked } from "./discover-connect-account"
import { resolveConnectReadyForCheckout } from "./resolve-connect-account"
import { syncConnectAccountRow } from "./sync-account-from-stripe"
import type { BusinessStripeConnectAccountRow } from "./types"

function connectAccountCreateParams(biz: {
  id: string
  name?: string | null
  easetag?: string | null
  country?: string | null
  website?: string | null
  support_email?: string | null
  email?: string
}): Stripe.AccountCreateParams {
  const name = typeof biz.name === "string" && biz.name.trim() ? biz.name.trim() : undefined
  return {
    country: resolveBusinessCountryIso2(biz.country as string | null) || "US",
    email: biz.email || undefined,
    business_type: "company",
    company: { name },
    business_profile: {
      name,
      url: typeof biz.website === "string" && biz.website.trim() ? biz.website.trim() : undefined,
      product_description: "Invoice payments settled to Easner wallet via virtual account",
    },
    metadata: {
      easner_business_id: biz.id,
      easner_easetag: typeof biz.easetag === "string" ? biz.easetag : "",
    },
    // White-label Direct Charges: connected account is MoR. Platform can still
    // absorb negative balances (losses) and Stripe fees as a commercial term.
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
      payouts: { schedule: { interval: "daily" } },
      payments: { statement_descriptor: buildConnectedAccountStatementDescriptor(name) },
    },
  }
}

/**
 * Create (or return existing) Stripe Connect account for a business.
 * Direct Charges: connected account is merchant of record; no seller Dashboard.
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
    return syncConnectAccountRow(admin, {
      businessId: input.businessId,
      stripeAccountId: String(existing.stripe_account_id),
    })
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

  const email =
    input.email?.trim() ||
    (typeof biz.support_email === "string" ? biz.support_email.trim() : "") ||
    undefined

  const stripe = getStripe()
  const account = await stripe.accounts.create(
    connectAccountCreateParams({
      id: input.businessId,
      name: biz.name as string | null,
      easetag: biz.easetag as string | null,
      country: biz.country as string | null,
      website: biz.website as string | null,
      email,
    }),
  )

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

/**
 * Test-mode Direct Charges cannot use a live `acct_`. Create or reuse a test
 * connected account keyed on the same business.
 */
export async function ensureTestConnectedAccount(
  admin: SupabaseClient,
  input: { businessId: string },
): Promise<string> {
  const { data: existing } = await admin
    .from("business_stripe_connect_accounts")
    .select("stripe_test_account_id")
    .eq("business_id", input.businessId)
    .maybeSingle()
  const stored = String(existing?.stripe_test_account_id ?? "").trim()
  if (stored) return stored

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id,name,easetag,country,support_email,website")
    .eq("id", input.businessId)
    .maybeSingle()
  if (bizErr || !biz?.id) {
    throw new Error(bizErr?.message || "Business not found")
  }

  const email =
    (typeof biz.support_email === "string" ? biz.support_email.trim() : "") || undefined
  const stripe = getStripe(false)
  const account = await stripe.accounts.create(
    connectAccountCreateParams({
      id: input.businessId,
      name: biz.name as string | null,
      easetag: biz.easetag as string | null,
      country: biz.country as string | null,
      website: biz.website as string | null,
      email,
    }),
  )

  await admin
    .from("business_stripe_connect_accounts")
    .update({
      stripe_test_account_id: account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", input.businessId)

  return account.id
}
