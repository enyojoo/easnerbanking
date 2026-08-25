import { NextResponse } from "next/server"
import { authenticateMerchantKey } from "@/lib/checkout/authenticate-merchant-key"
import { checkoutApiError } from "@/lib/checkout/api-errors"
import { parseCheckoutCurrency, SUPPORTED_CHECKOUT_CURRENCIES } from "@/lib/checkout/currencies"
import {
  parseIdempotencyKeyHeader,
  parseMerchantLineItems,
  validateMerchantMetadata,
} from "@/lib/checkout/merchant-session-input"
import { checkCheckoutRateLimit } from "@/lib/checkout/rate-limit"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createRecurringPrice } from "@/lib/stripe/recurring-price"
import { getStripe } from "@/lib/stripe/client"
import { buildEasnerStatementSuffix } from "@/lib/stripe/statement-descriptor"
import { parsePaymentLinkInterval } from "@/lib/payment-links/types"
import { resolveProductPrice, type ResolvedProductPrice } from "@/lib/products/types"
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

/**
 * Merchant-facing session API for the website embed. Amounts are always taken from
 * this server-to-server call, never from the browser, and return URLs must live on a
 * website the merchant has allow-listed on /checkout.
 *
 * Send an `Idempotency-Key` header to make retries safe: the same key returns the
 * session created by the first call instead of opening a duplicate.
 */
export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return checkoutApiError(auth.status, "invalid_api_key", auth.error)
  }

  const rate = checkCheckoutRateLimit(`sessions:${auth.ctx.keyId}`)
  if (!rate.allowed) {
    const response = checkoutApiError(
      429,
      "rate_limited",
      "Too many requests – slow down and retry shortly",
    )
    response.headers.set("retry-after", String(rate.retryAfterSeconds))
    return response
  }

  const idempotency = parseIdempotencyKeyHeader(request.headers.get("idempotency-key"))
  if (!idempotency.ok) {
    return checkoutApiError(400, idempotency.code, idempotency.message)
  }
  const idempotencyKey = idempotency.key
    ? `embed_${auth.ctx.businessId}_${idempotency.key}`
    : undefined

  // Replay: a session already created with this key is returned as-is.
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("online_checkout_sessions")
      .select("stripe_checkout_session_id, status, gross_cents, currency, customer_email, metadata, mode, livemode")
      .eq("business_id", auth.ctx.businessId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (existing?.stripe_checkout_session_id) {
      try {
        const session = await getStripe().checkout.sessions.retrieve(
          String(existing.stripe_checkout_session_id),
        )
        const existingMetadata =
          existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? (existing.metadata as Record<string, unknown>)
            : {}
        return NextResponse.json(
          {
            client_secret: session.client_secret,
            checkout_session_id: existing.stripe_checkout_session_id,
            amount: existing.gross_cents,
            currency: existing.currency,
            mode: existing.mode ?? "payment",
            customer_email: existing.customer_email,
            customer_name:
              typeof existingMetadata.easner_customer_name === "string"
                ? existingMetadata.easner_customer_name
                : null,
            livemode: existing.livemode !== false,
            idempotent_replay: true,
          },
          { status: 200 },
        )
      } catch {
        return checkoutApiError(
          500,
          "idempotent_replay_failed",
          "A session exists for this Idempotency-Key but could not be loaded – retry with a new key",
          "api_error",
        )
      }
    }
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: string
    amount?: number
    currency?: string
    line_items?: unknown
    product_id?: string
    price_id?: string
    customer_email?: string
    customer_name?: string
    interval?: string
    success_url?: string
    cancel_url?: string
    metadata?: unknown
  } | null
  if (!body) {
    return checkoutApiError(400, "invalid_json", "Request body must be JSON")
  }

  // Catalog path: product_id resolves amount, currency, and cadence server-side,
  // so a compromised page can never invent its own price.
  const productId = String(body.product_id ?? "").trim()
  let catalog: ResolvedProductPrice | null = null
  if (productId) {
    if (body.amount !== undefined || body.line_items !== undefined) {
      return checkoutApiError(
        400,
        "product_amount_conflict",
        "Send either product_id or amount/line_items, not both",
      )
    }
    const resolution = await resolveProductPrice(admin, {
      businessId: auth.ctx.businessId,
      productId,
      priceId: String(body.price_id ?? "").trim() || null,
      currency: body.currency ?? null,
    })
    if (!resolution.ok) {
      return checkoutApiError(resolution.status, "product_unresolvable", resolution.error)
    }
    catalog = resolution.resolved
  }

  const rawMode = catalog
    ? catalog.price.mode === "subscription"
      ? "subscription"
      : "payment"
    : String(body.mode ?? "payment").trim()
  if (rawMode !== "payment" && rawMode !== "subscription") {
    return checkoutApiError(400, "mode_invalid", "mode must be payment or subscription")
  }
  const mode = rawMode as "payment" | "subscription"

  const lineItemsResult = parseMerchantLineItems(body.line_items)
  if (!lineItemsResult.ok) {
    return checkoutApiError(400, lineItemsResult.code, lineItemsResult.message)
  }
  const lineItems = lineItemsResult.items
  if (mode === "subscription" && lineItems.length > 1) {
    return checkoutApiError(
      400,
      "line_items_subscription_single",
      "Subscriptions support a single line item",
    )
  }

  const bodyAmountCents =
    body.amount === undefined || body.amount === null ? null : Math.round(Number(body.amount))
  if (bodyAmountCents !== null && (!Number.isFinite(bodyAmountCents) || bodyAmountCents <= 0)) {
    return checkoutApiError(400, "amount_invalid", "amount must be a positive integer in cents")
  }
  if (bodyAmountCents !== null && lineItems.length > 0 && bodyAmountCents !== lineItemsResult.totalCents) {
    return checkoutApiError(
      400,
      "amount_mismatch",
      `amount (${bodyAmountCents}) does not match the line_items total (${lineItemsResult.totalCents})`,
    )
  }
  const amountCents = catalog
    ? catalog.price.unitAmountCents
    : lineItems.length > 0
      ? lineItemsResult.totalCents
      : bodyAmountCents ?? 0
  if (amountCents <= 0) {
    return checkoutApiError(400, "amount_required", "Send amount in cents, line_items, or product_id")
  }

  const currency = catalog ? catalog.price.currency : parseCheckoutCurrency(body.currency ?? "USD")
  if (!currency) {
    return checkoutApiError(
      400,
      "currency_unsupported",
      `currency must be one of ${SUPPORTED_CHECKOUT_CURRENCIES.join(", ")}`,
    )
  }

  const metadataResult = validateMerchantMetadata(body.metadata)
  if (!metadataResult.ok) {
    return checkoutApiError(400, metadataResult.code, metadataResult.message)
  }

  const productName = catalog?.product.name ?? lineItems[0]?.name ?? "Online payment"
  const productDescription = catalog?.product.description ?? lineItems[0]?.description ?? null

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

  const requestedSuccess = String(body.success_url ?? "").trim()
  const requestedCancel = String(body.cancel_url ?? "").trim()
  const site = pickCheckoutSite(sites, requestedSuccess, request.headers.get("origin"))
  const successUrl =
    requestedSuccess || site?.success_url || settings?.default_success_url || buildPaymentThanksUrl()
  const cancelUrl = requestedCancel || site?.cancel_url || settings?.default_cancel_url || null

  const allowedOrigins = [
    ...new Set([
      ...(Array.isArray(settings?.allowed_origins) ? settings.allowed_origins : []),
      ...sites.map((row) => row.origin).filter(Boolean),
    ]),
  ]
  if (allowedOrigins.length === 0) {
    // Never accept arbitrary return URLs from a merchant with no registered website.
    if (requestedSuccess || requestedCancel) {
      return checkoutApiError(
        400,
        "website_not_registered",
        "Add your website on the Checkout page before passing success_url or cancel_url",
      )
    }
  } else {
    for (const url of [successUrl, cancelUrl]) {
      if (!url) continue
      const origin = originOf(url)
      if (!origin || !allowedOrigins.includes(origin)) {
        return checkoutApiError(
          400,
          "url_not_allowed",
          `${url} is not on your list of allowed websites`,
        )
      }
    }
  }

  let stripePriceId: string | null = null
  if (mode === "subscription") {
    if (catalog?.price.stripePriceId) {
      stripePriceId = catalog.price.stripePriceId
    } else {
      const interval = catalog
        ? catalog.price.billingInterval ?? "month"
        : parsePaymentLinkInterval(body.interval ?? "month")
      if (!interval) {
        return checkoutApiError(400, "interval_invalid", "interval must be month or year")
      }
      const price = await createRecurringPrice({
        label: productName,
        description: productDescription,
        amountCents,
        currency,
        interval,
      })
      if (!price.ok) {
        return checkoutApiError(price.status, "recurring_price_failed", price.error, "api_error")
      }
      stripePriceId = price.priceId
      // Catalog prices reuse the platform Price on every future session.
      if (catalog) {
        await admin
          .from("business_product_prices")
          .update({ stripe_price_id: stripePriceId, updated_at: new Date().toISOString() })
          .eq("id", catalog.price.id)
          .is("stripe_price_id", null)
      }
    }
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", auth.ctx.businessId)
    .maybeSingle()

  const customerEmail = String(body.customer_email ?? "").trim() || null
  const customerName = String(body.customer_name ?? "").trim() || null

  const result = await createOnlineCheckoutSession(admin, {
    source: "embed",
    businessId: auth.ctx.businessId,
    mode,
    listedAmountCents: amountCents,
    currency,
    productName,
    productDescription,
    lineItems: mode === "payment" && lineItems.length > 0 ? lineItems : undefined,
    customerEmail,
    customerName,
    statementSuffix: buildEasnerStatementSuffix({
      businessName: typeof biz?.name === "string" ? biz.name : null,
    }),
    returnUrl: successUrl,
    stripePriceId,
    trialDays: catalog?.price.trialDays ?? null,
    livemode: auth.ctx.mode === "live",
    idempotencyKey,
    metadata: {
      ...(cancelUrl ? { easner_cancel_url: cancelUrl } : {}),
      ...(catalog ? { easner_product_id: catalog.product.id, easner_price_id: catalog.price.id } : {}),
      ...metadataResult.metadata,
    },
  })

  if (!result.ok) {
    return checkoutApiError(
      result.status,
      result.status >= 500 ? "session_create_failed" : "session_rejected",
      result.error,
    )
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
      livemode: auth.ctx.mode === "live",
    },
    { status: 201 },
  )
}

/** Session status for order pages: `GET /v1/checkout/sessions?id=cs_…`. */
export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return checkoutApiError(auth.status, "invalid_api_key", auth.error)
  }

  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id) {
    return checkoutApiError(400, "id_required", "id is required")
  }

  const { data } = await admin
    .from("online_checkout_sessions")
    .select(
      "stripe_checkout_session_id, status, gross_cents, currency, customer_email, metadata, completed_at, livemode, mode",
    )
    .eq("business_id", auth.ctx.businessId)
    .eq("stripe_checkout_session_id", id)
    .maybeSingle()

  if (!data) {
    return checkoutApiError(404, "session_not_found", "No checkout session with that id")
  }

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const customerName =
    typeof metadata.easner_customer_name === "string" && metadata.easner_customer_name.trim()
      ? metadata.easner_customer_name.trim()
      : null

  return NextResponse.json({
    checkout_session_id: data.stripe_checkout_session_id,
    status: data.status,
    amount: data.gross_cents,
    currency: data.currency,
    customer_email: data.customer_email,
    customer_name: customerName,
    completed_at: data.completed_at,
    mode: data.mode ?? "payment",
    livemode: data.livemode !== false,
  })
}
