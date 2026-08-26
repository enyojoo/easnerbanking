import type { SupabaseClient } from "@supabase/supabase-js"
import { checkoutKeyMode, hashCheckoutSecretKey, type CheckoutKeyMode } from "./secrets"

export type MerchantKeyContext = {
  businessId: string
  mode: CheckoutKeyMode
  keyId: string
}

/**
 * Authenticate `Authorization: Bearer easner_sk_…` for the merchant checkout API.
 * Only the hash is stored, and keys are scoped to checkout so a leak cannot move money.
 */
export async function authenticateMerchantKey(
  admin: SupabaseClient,
  authorizationHeader: string | null,
): Promise<{ ok: true; ctx: MerchantKeyContext } | { ok: false; status: number; error: string }> {
  const raw = String(authorizationHeader ?? "").trim()
  const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw
  if (!token) {
    return { ok: false, status: 401, error: "Missing API key" }
  }

  const mode = checkoutKeyMode(token)
  if (!mode || !token.startsWith("easner_sk_")) {
    return { ok: false, status: 401, error: "Invalid API key" }
  }

  const { data } = await admin
    .from("business_api_keys")
    .select("id, business_id, mode, scopes")
    .eq("secret_key_hash", hashCheckoutSecretKey(token))
    .is("revoked_at", null)
    .maybeSingle()

  if (!data?.business_id) {
    return { ok: false, status: 401, error: "Invalid API key" }
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : []
  if (!scopes.includes("checkout")) {
    return { ok: false, status: 403, error: "This key cannot create checkout sessions" }
  }

  await admin
    .from("business_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id as string)

  return {
    ok: true,
    ctx: {
      businessId: String(data.business_id),
      mode: (data.mode as CheckoutKeyMode) ?? mode,
      keyId: String(data.id),
    },
  }
}

export async function authenticatePublishableKey(
  admin: SupabaseClient,
  publishableKey: string,
): Promise<{ ok: true; ctx: MerchantKeyContext } | { ok: false; status: number; error: string }> {
  const token = publishableKey.trim()
  const mode = checkoutKeyMode(token)
  if (!mode || !token.startsWith("easner_pk_")) {
    return { ok: false, status: 401, error: "Invalid publishable key" }
  }

  const { data } = await admin
    .from("business_api_keys")
    .select("id, business_id, mode, scopes")
    .eq("publishable_key", token)
    .is("revoked_at", null)
    .maybeSingle()

  if (!data?.business_id) {
    return { ok: false, status: 401, error: "Invalid publishable key" }
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : []
  if (!scopes.includes("checkout")) {
    return { ok: false, status: 403, error: "This key cannot start checkout" }
  }

  await admin
    .from("business_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id as string)

  return {
    ok: true,
    ctx: {
      businessId: String(data.business_id),
      mode: (data.mode as CheckoutKeyMode) ?? mode,
      keyId: String(data.id),
    },
  }
}
