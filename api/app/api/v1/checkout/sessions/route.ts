import { NextResponse } from "next/server"
import { authenticateMerchantKey, requireScope } from "@/lib/checkout/authenticate-merchant-key"
import { checkoutApiError } from "@/lib/checkout/checkout-api-error"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createRecurringPrice } from "@/lib/stripe/recurring-price"
import { buildEasnerStatementSuffix } from "@/lib/stripe/statement-descriptor"
import {
  publicMerchantMetadata,
  sanitizeMerchantMetadata,
} from "@/lib/stripe/checkout-session-metadata"
import { parsePaymentLinkInterval } from "@/lib/payment-links/types"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type CheckoutSettings = {
  allowed_origins: string[] | null
  default_success_url: string | null
  default_cancel_url: string | null
}

type CheckoutSiteRow = {
  origin: string
  success_url: string | null
  cancel_url: string | null
}

function originOf(url: string): string | null {
  try {
    return new URL(url.replace("{CHECKOUT_SESSION_ID}", "placeholder")).origin
  } catch {
    return null
  }
}

function pickCheckoutSite(
  sites: CheckoutSiteRow[],
  successUrl: string,
  requestOrigin: string | null,
): CheckoutSiteRow | null {
  const fromSuccess = originOf(successUrl)
  if (fromSuccess) {
    const match = sites.find((site) => site.origin === fromSuccess)
    if (match) return match
  }
  if (requestOrigin) {
    const match = sites.find((site) => site.origin === requestOrigin)
    if (match) return match
  }
  return sites.find((site) => site.success_url) ?? sites[0] ?? null
}

function jsonError(status: number, code: string, message: string) {
  const { body } = checkoutApiError(status, code, message)
  return NextResponse.json(body, { status })
}

function merchantIdempotencyKey(header: string | null): string | undefined {
  const value = String(header ?? "").trim()
  if (!value || value.length > 256) return undefined
  return `merchant_${value}`
}

/**
 * Merchant-facing session API for the website embed. Amounts are always taken from
 * this server-to-server call, never from the browser, and return URLs must live on a
 * website the merchant has allow-listed on /checkout.
 */
export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return jsonError(auth.status, auth.status === 403 ? "key_forbidden" : "invalid_api_key", auth.error)
  }
  const scoped = requireScope(auth.ctx, "checkout")
  if (!scoped.ok) {
    return jsonError(scoped.status, "key_forbidden", scoped.error)
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: string
    amount?: number
    currency?: string
    line_items?: { name?: string; amount?: number; description?: string }[]
    customer_email?: string
    customer_name?: string
    interval?: string
    success_url?: string
    cancel_url?: string
    metadata?: Record<string, string>
  } | null

  const mode = body?.mode === "subscription" ? "subscription" : "payment"
  const amountCents = Math.round(Number(body?.amount ?? body?.line_items?.[0]?.amount ?? 0))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return jsonError(400, "invalid_amount", "amount must be a positive integer in cents")
  }

  const currency = String(body?.currency ?? "usd").trim().toUpperCase()
  const productName = String(body?.line_items?.[0]?.name ?? "").trim() || "Online payment"
  const productDescription = String(body?.line_items?.[0]?.description ?? "").trim() || null

  const [{ data: settingsRow }, { data: siteRows }] = await Promise.all([
    admin
      .from("business_checkout_settings")
      .select("allowed_origins, default_success_url, default_cancel_url")
      .eq("business_id", auth.ctx.businessId)
      .maybeSingle(),
    admin
      .from("business_checkout_sites")
      .select("origin, success_url, cancel_url")
      .eq("business_id", auth.ctx.businessId),
  ])
  const settings = (settingsRow ?? null) as CheckoutSettings | null
  const sites = (siteRows ?? []) as CheckoutSiteRow[]

  const requestedSuccess = String(body?.success_url ?? "").trim()
  const requestedCancel = String(body?.cancel_url ?? "").trim()
  const requestOrigin = request.headers.get("origin")
  const site = pickCheckoutSite(sites, requestedSuccess, requestOrigin)
  const successUrl =
    requestedSuccess || site?.success_url || settings?.default_success_url || buildPaymentThanksUrl()
  const cancelUrl = requestedCancel || site?.cancel_url || settings?.default_cancel_url || null

  const allowedOrigins = [
    ...new Set([
      ...(Array.isArray(settings?.allowed_origins) ? settings.allowed_origins : []),
      ...sites.map((row) => row.origin).filter(Boolean),
    ]),
  ]
  if (sites.length > 0 || allowedOrigins.length > 0) {
    if (allowedOrigins.length === 0) {
      return jsonError(400, "origin_not_allowed", "Register a website on Checkout before creating sessions")
    }
    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return jsonError(
        400,
        "origin_not_allowed",
        `${requestOrigin} is not on your list of allowed websites`,
      )
    }
    for (const url of [successUrl, cancelUrl]) {
      if (!url) continue
      const origin = originOf(url)
      if (!origin || !allowedOrigins.includes(origin)) {
        return jsonError(400, "origin_not_allowed", `${url} is not on your list of allowed websites`)
      }
    }
  }

  const livemode = auth.ctx.mode === "live"
  let stripePriceId: string | null = null
  if (mode === "subscription") {
    const interval = parsePaymentLinkInterval(body?.interval ?? "month")
    if (!interval) {
      return jsonError(400, "invalid_interval", "interval must be month or year")
    }
    const { getConnectAccountRow } = await import("@/lib/stripe/connect")
    const { ensureTestConnectedAccount } = await import("@/lib/stripe/connect/create-connected-account")
    const connectRow = await getConnectAccountRow(admin, auth.ctx.businessId)
    let stripeAccountId = connectRow?.stripe_account_id?.trim() || ""
    if (!livemode) {
      try {
        stripeAccountId = await ensureTestConnectedAccount(admin, { businessId: auth.ctx.businessId })
      } catch (e) {
        return jsonError(502, "price_create_failed", e instanceof Error ? e.message : "Could not set up test payments")
      }
    }
    const price = await createRecurringPrice({
      label: productName,
      description: productDescription,
      amountCents,
      currency,
      interval,
      stripeAccountId,
      livemode,
    })
    if (!price.ok) {
      return jsonError(price.status, "price_create_failed", price.error)
    }
    stripePriceId = price.priceId
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", auth.ctx.businessId)
    .maybeSingle()

  const customerEmail = String(body?.customer_email ?? "").trim() || null
  const customerName = String(body?.customer_name ?? "").trim() || null
  const merchantMetadata = sanitizeMerchantMetadata(body?.metadata)

  const result = await createOnlineCheckoutSession(admin, {
    source: "embed",
    businessId: auth.ctx.businessId,
    mode,
    listedAmountCents: amountCents,
    currency,
    productName,
    productDescription,
    customerEmail,
    customerName,
    statementSuffix: buildEasnerStatementSuffix({
      businessName: typeof biz?.name === "string" ? biz.name : null,
    }),
    returnUrl: successUrl,
    stripePriceId,
    livemode,
    apiKeyId: auth.ctx.keyId,
    idempotencyKey: merchantIdempotencyKey(request.headers.get("idempotency-key")),
    metadata: {
      ...(cancelUrl ? { easner_cancel_url: cancelUrl } : {}),
      ...merchantMetadata,
    },
  })

  if (!result.ok) {
    return jsonError(result.status, "session_create_failed", result.error)
  }

  return NextResponse.json(
    {
      client_secret: result.clientSecret,
      checkout_session_id: result.checkoutSessionId,
      amount: result.amounts.customerAmountCents,
      currency,
      mode,
      customer_email: customerEmail,
      customer_name: customerName,
      metadata: merchantMetadata,
    },
    { status: 201 },
  )
}

/** Session status for order pages: `GET /v1/checkout/sessions?id=cs_…`. */
export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return jsonError(auth.status, auth.status === 403 ? "key_forbidden" : "invalid_api_key", auth.error)
  }
  const scoped = requireScope(auth.ctx, "checkout")
  if (!scoped.ok) {
    return jsonError(scoped.status, "key_forbidden", scoped.error)
  }

  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id) {
    return jsonError(400, "missing_id", "id is required")
  }

  const { data } = await admin
    .from("online_checkout_sessions")
    .select(
      "stripe_checkout_session_id, status, gross_cents, currency, customer_email, metadata, completed_at, mode, stripe_subscription_id",
    )
    .eq("business_id", auth.ctx.businessId)
    .eq("stripe_checkout_session_id", id)
    .maybeSingle()

  if (!data) {
    return jsonError(404, "not_found", "Not found")
  }

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const customerName =
    typeof metadata.easner_customer_name === "string" && metadata.easner_customer_name.trim()
      ? metadata.easner_customer_name.trim()
      : null
  const subscriptionId =
    typeof data.stripe_subscription_id === "string" && data.stripe_subscription_id.trim()
      ? data.stripe_subscription_id.trim()
      : null
  const mode = data.mode === "subscription" ? "subscription" : "payment"

  return NextResponse.json({
    checkout_session_id: data.stripe_checkout_session_id,
    status: data.status,
    amount: data.gross_cents,
    currency: data.currency,
    mode,
    customer_email: data.customer_email,
    customer_name: customerName,
    subscription_id: subscriptionId,
    metadata: publicMerchantMetadata(metadata),
    completed_at: data.completed_at,
  })
}
