import { NextResponse } from "next/server"
import {
  buildEmbedAppearance,
  buildEmbedButtonStyle,
  parseCheckoutBranding,
} from "@/lib/checkout/embed-appearance"
import { checkoutKeyMode } from "@/lib/checkout/secrets"
import { getStripePublishableKey } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "private, max-age=60",
} as const

function reject(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status, headers: CORS_HEADERS })
}

/**
 * Public config for the checkout SDK, keyed by the merchant publishable key.
 *
 * This is what makes `easner_pk_*` a real credential: an unknown or revoked key
 * is refused, and when the merchant has registered websites the browser `Origin`
 * must be one of them. Also delivers the dashboard-configured branding so every
 * mount matches the merchant's look without page-side configuration.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const key = url.searchParams.get("key")?.trim() ?? ""
  const mode = checkoutKeyMode(key)
  if (!key.startsWith("easner_pk_") || !mode) {
    return reject(400, "publishable_key_invalid", "Pass your easner_pk_… publishable key as ?key=")
  }

  const admin = createSupabaseAdmin()
  const { data: keyRow } = await admin
    .from("business_api_keys")
    .select("business_id, mode, revoked_at")
    .eq("publishable_key", key)
    .maybeSingle()

  if (!keyRow?.business_id || keyRow.revoked_at) {
    return reject(403, "publishable_key_unknown", "This publishable key is unknown or was revoked")
  }
  const businessId = String(keyRow.business_id)

  const [{ data: settings }, { data: sites }, { data: biz }] = await Promise.all([
    admin
      .from("business_checkout_settings")
      .select("appearance, allowed_origins, live_mode_enabled")
      .eq("business_id", businessId)
      .maybeSingle(),
    admin.from("business_checkout_sites").select("origin").eq("business_id", businessId),
    admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
  ])

  const allowedOrigins = [
    ...new Set([
      ...(Array.isArray(settings?.allowed_origins) ? settings.allowed_origins.map(String) : []),
      ...(sites ?? []).map((row) => String(row.origin ?? "")).filter(Boolean),
    ]),
  ]
  const requestOrigin = request.headers.get("origin")?.trim() || ""
  if (allowedOrigins.length > 0 && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    return reject(
      403,
      "domain_not_allowed",
      `${requestOrigin} is not on this account's list of allowed websites – add it on the Checkout page`,
    )
  }

  if (mode === "live" && settings?.live_mode_enabled === false) {
    return reject(
      403,
      "live_mode_disabled",
      "Live payments are switched off for this account – finish setup on the Checkout page",
    )
  }

  const branding = parseCheckoutBranding(settings?.appearance)

  return NextResponse.json(
    {
      valid: true,
      livemode: mode === "live",
      stripe_publishable_key: getStripePublishableKey(),
      appearance: buildEmbedAppearance(branding),
      button: buildEmbedButtonStyle(branding),
      business_name: typeof biz?.name === "string" ? biz.name : null,
    },
    { headers: CORS_HEADERS },
  )
}
