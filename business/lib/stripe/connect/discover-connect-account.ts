import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "../client"
import { syncConnectAccountRow } from "./sync-account-from-stripe"
import type { BusinessStripeConnectAccountRow } from "./types"

function sandboxAccountMap(): Record<string, string> {
  const raw = process.env.STRIPE_CONNECT_ACCOUNT_BY_BUSINESS_ID?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[key.trim().toLowerCase()] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

function readMetadataBusinessId(account: Stripe.Account): string | null {
  const raw = account.metadata?.easner_business_id
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed || null
}

function businessIdsMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

async function searchConnectAccountByMetadata(businessId: string): Promise<string | null> {
  const stripe = getStripe()
  try {
    const result = await stripe.accounts.search({
      query: `metadata['easner_business_id']:'${businessId.trim()}'`,
      limit: 1,
    })
    const account = result.data[0]
    if (!account?.id) return null
    const metaBiz = readMetadataBusinessId(account)
    return metaBiz && businessIdsMatch(metaBiz, businessId) ? account.id : null
  } catch (e) {
    console.warn("[stripe-connect] accounts.search by metadata failed:", e)
    return null
  }
}

async function listConnectAccountByMetadata(businessId: string): Promise<string | null> {
  const stripe = getStripe()
  let startingAfter: string | undefined
  for (let page = 0; page < 10; page++) {
    const list = await stripe.accounts.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const account of list.data) {
      const metaBiz = readMetadataBusinessId(account)
      if (metaBiz && businessIdsMatch(metaBiz, businessId)) {
        return account.id
      }
    }
    if (!list.has_more || list.data.length === 0) break
    startingAfter = list.data[list.data.length - 1]?.id
  }
  return null
}

/** Find a platform connected account tagged with easner_business_id metadata. */
export async function discoverStripeConnectAccountId(businessId: string): Promise<string | null> {
  const normalizedBusinessId = businessId.trim()
  if (!normalizedBusinessId) return null

  const mapped = sandboxAccountMap()[normalizedBusinessId.toLowerCase()]
  if (mapped) return mapped

  const fromSearch = await searchConnectAccountByMetadata(normalizedBusinessId)
  if (fromSearch) return fromSearch

  return listConnectAccountByMetadata(normalizedBusinessId)
}

/**
 * Attach an existing Stripe connected account to a business row (sandbox recovery /
 * Dashboard-created accounts). Sets easner_business_id metadata when missing.
 */
export async function linkExistingConnectAccount(
  admin: SupabaseClient,
  input: { businessId: string; stripeAccountId: string },
): Promise<BusinessStripeConnectAccountRow> {
  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(input.stripeAccountId)
  const metaBiz = readMetadataBusinessId(account)

  if (metaBiz && !businessIdsMatch(metaBiz, input.businessId)) {
    throw new Error("This Stripe account belongs to another Easner business")
  }

  if (!metaBiz) {
    await stripe.accounts.update(account.id, {
      metadata: {
        ...account.metadata,
        easner_business_id: input.businessId.trim(),
      },
    })
  }

  const now = new Date().toISOString()
  const { error } = await admin.from("business_stripe_connect_accounts").upsert(
    {
      business_id: input.businessId,
      stripe_account_id: account.id,
      default_settlement_rail: "grid_va",
      updated_at: now,
      created_at: now,
    },
    { onConflict: "business_id" },
  )

  if (error) {
    throw new Error(error.message)
  }

  return syncConnectAccountRow(admin, {
    businessId: input.businessId,
    stripeAccountId: account.id,
    account,
  })
}

/** Resolve DB row or discover/link a pre-existing Stripe connected account. */
export async function ensureConnectAccountLinked(
  admin: SupabaseClient,
  businessId: string,
): Promise<BusinessStripeConnectAccountRow | null> {
  const { data: existing } = await admin
    .from("business_stripe_connect_accounts")
    .select("stripe_account_id")
    .eq("business_id", businessId)
    .maybeSingle()

  if (existing?.stripe_account_id) {
    return syncConnectAccountRow(admin, {
      businessId,
      stripeAccountId: String(existing.stripe_account_id),
    })
  }

  const discovered = await discoverStripeConnectAccountId(businessId)
  if (!discovered) return null

  return linkExistingConnectAccount(admin, {
    businessId,
    stripeAccountId: discovered,
  })
}
