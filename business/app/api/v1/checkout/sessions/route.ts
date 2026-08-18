import { NextResponse } from "next/server"
import { authenticateMerchantKey } from "@/lib/checkout/authenticate-merchant-key"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createRecurringPrice } from "@/lib/stripe/recurring-price"
import { buildEasnerStatementSuffix } from "@/lib/stripe/statement-descriptor"
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

/**
 * Merchant-facing session API for the website embed. Amounts are always taken from
 * this server-to-server call, never from the browser, and return URLs must live on a
 * website the merchant has allow-listed on /checkout.
 */
export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
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
    return NextResponse.json({ error: "amount must be a positive integer in cents" }, { status: 400 })
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
  if (allowedOrigins.length > 0) {
    for (const url of [successUrl, cancelUrl]) {
      if (!url) continue
      const origin = originOf(url)
      if (!origin || !allowedOrigins.includes(origin)) {
        return NextResponse.json(
          { error: `${url} is not on your list of allowed websites` },
          { status: 400 },
        )
      }
    }
  }

  let stripePriceId: string | null = null
  if (mode === "subscription") {
    const interval = parsePaymentLinkInterval(body?.interval ?? "month")
    if (!interval) {
      return NextResponse.json({ error: "interval must be month or year" }, { status: 400 })
    }
    const price = await createRecurringPrice({
      label: productName,
      description: productDescription,
      amountCents,
      currency,
      interval,
    })
    if (!price.ok) {
      return NextResponse.json({ error: price.error }, { status: price.status })
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
    livemode: auth.ctx.mode === "live",
    metadata: {
      ...(cancelUrl ? { easner_cancel_url: cancelUrl } : {}),
      ...(body?.metadata ?? {}),
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
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
    },
    { status: 201 },
  )
}

/** Session status for order pages: `GET /v1/checkout/sessions?id=cs_…`. */
export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const id = new URL(request.url).searchParams.get("id")?.trim()
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const { data } = await admin
    .from("online_checkout_sessions")
    .select("stripe_checkout_session_id, status, gross_cents, currency, customer_email, metadata, completed_at")
    .eq("business_id", auth.ctx.businessId)
    .eq("stripe_checkout_session_id", id)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
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
  })
}
