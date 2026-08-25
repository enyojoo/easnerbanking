import { createHash, randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const TOKEN_TTL_DAYS = 30

function hashPortalToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex")
}

export type PortalTokenRow = {
  businessId: string
  stripeSubscriptionId: string
  stripeCustomerId: string | null
  customerEmail: string
}

/**
 * Mint a self-serve portal link for one subscription. The URL carries a random
 * token; only its hash is stored, and it expires after 30 days – merchants can
 * mint a fresh one any time.
 */
export async function issuePortalToken(
  admin: SupabaseClient,
  input: PortalTokenRow,
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const token = `easner_mng_${randomBytes(24).toString("hex")}`
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await admin.from("subscription_portal_tokens").insert({
    token_hash: hashPortalToken(token),
    business_id: input.businessId,
    stripe_subscription_id: input.stripeSubscriptionId,
    stripe_customer_id: input.stripeCustomerId,
    customer_email: input.customerEmail,
    expires_at: expiresAt,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, token, expiresAt }
}

/** Resolve a portal token to its subscription; null when unknown or expired. */
export async function resolvePortalToken(
  admin: SupabaseClient,
  token: string,
): Promise<PortalTokenRow | null> {
  const value = String(token ?? "").trim()
  if (!value.startsWith("easner_mng_")) return null
  const { data } = await admin
    .from("subscription_portal_tokens")
    .select("business_id, stripe_subscription_id, stripe_customer_id, customer_email, expires_at")
    .eq("token_hash", hashPortalToken(value))
    .maybeSingle()
  if (!data?.stripe_subscription_id) return null
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null
  return {
    businessId: String(data.business_id),
    stripeSubscriptionId: String(data.stripe_subscription_id),
    stripeCustomerId: data.stripe_customer_id ? String(data.stripe_customer_id) : null,
    customerEmail: String(data.customer_email ?? ""),
  }
}
