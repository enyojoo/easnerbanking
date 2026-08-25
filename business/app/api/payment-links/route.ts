import { NextResponse } from "next/server"
import { createAutopayoutConfig } from "@/lib/autopayout/create-autopayout-config"
import { parseCheckoutCurrency, SUPPORTED_CHECKOUT_CURRENCIES } from "@/lib/checkout/currencies"
import { buildPaymentLinkUrl } from "@/lib/payment-links/public-url"
import { normalizePaymentLinkSlug, validatePaymentLinkSlug } from "@/lib/payment-links/slug"
import {
  mapRowToPaymentLink,
  parsePaymentLinkInterval,
  parsePaymentLinkMode,
  parsePaymentLinkRail,
} from "@/lib/payment-links/types"
import { createRecurringPrice } from "@/lib/stripe/recurring-price"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const LINK_COLUMNS =
  "id, public_id, slug, label, description, amount_cents, currency, rail, mode, billing_interval, trial_days, redirect_url, stripe_price_id, autopayout_config_id, payment_count, archived_at, created_at"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const includeArchived = new URL(request.url).searchParams.get("archived") === "true"

  const admin = createSupabaseAdmin()
  let query = admin
    .from("payment_links")
    .select(LINK_COLUMNS)
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (!includeArchived) {
    query = query.is("archived_at", null)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const linkIds = (data ?? []).map((row) => String(row.id))
  const totals = new Map<string, { totalCollectedCents: number; lastPaymentAt: string | null }>()
  if (linkIds.length > 0) {
    const { data: settlements } = await admin
      .from("checkout_stripe_settlements")
      .select("payment_link_id, gross_cents, created_at, refunded_at")
      .eq("business_id", ctx.businessId)
      .in("payment_link_id", linkIds)
    for (const row of settlements ?? []) {
      const id = typeof row.payment_link_id === "string" ? row.payment_link_id : null
      if (!id || row.refunded_at) continue
      const current = totals.get(id) ?? { totalCollectedCents: 0, lastPaymentAt: null }
      current.totalCollectedCents += Number(row.gross_cents ?? 0)
      const created = typeof row.created_at === "string" ? row.created_at : null
      if (created && (!current.lastPaymentAt || created > current.lastPaymentAt)) {
        current.lastPaymentAt = created
      }
      totals.set(id, current)
    }
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("easetag")
    .eq("id", ctx.businessId)
    .maybeSingle()
  const easetag = typeof biz?.easetag === "string" ? biz.easetag : null

  const links = (data ?? []).map((row) => {
    const link = mapRowToPaymentLink(row as Record<string, unknown>)
    const stats = totals.get(link.id)
    return {
      ...link,
      url: buildPaymentLinkUrl(easetag, link),
      totalCollectedCents: stats?.totalCollectedCents ?? 0,
      lastPaymentAt: stats?.lastPaymentAt ?? null,
    }
  })

  return NextResponse.json({ links, easetag })
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    label?: string
    slug?: string
    description?: string | null
    amount?: number | string
    currency?: string
    rail?: string
    mode?: string
    billing_interval?: string
    trial_days?: number | string | null
    redirect_url?: string | null
    /** Stablecoin rail: payout account to auto-settle deposits into. */
    recipient_id?: string
    payer_wallet_id?: string
    crypto_currency?: string
    network?: string
  } | null

  const label = String(body?.label ?? "").trim().slice(0, 200)
  if (!label) {
    return NextResponse.json({ error: "Add a name for this link" }, { status: 400 })
  }

  const slug = normalizePaymentLinkSlug(String(body?.slug ?? "") || label)
  const slugCheck = validatePaymentLinkSlug(slug)
  if (!slugCheck.valid) {
    return NextResponse.json({ error: slugCheck.error }, { status: 400 })
  }

  const rail = parsePaymentLinkRail(body?.rail ?? "card_bank")
  if (!rail) {
    return NextResponse.json({ error: "Choose how this link collects money" }, { status: 400 })
  }

  const mode = parsePaymentLinkMode(body?.mode ?? "one_time")
  if (!mode) {
    return NextResponse.json({ error: "Choose one-time or recurring" }, { status: 400 })
  }
  if (mode === "subscription" && rail !== "card_bank") {
    return NextResponse.json(
      { error: "Recurring payments are available on card and bank links only" },
      { status: 400 },
    )
  }

  const billingInterval =
    mode === "subscription" ? parsePaymentLinkInterval(body?.billing_interval ?? "month") : null
  if (mode === "subscription" && !billingInterval) {
    return NextResponse.json({ error: "Choose a monthly or yearly interval" }, { status: 400 })
  }

  const amountCents = Math.round(Number(body?.amount ?? 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
  }

  const currency = parseCheckoutCurrency(body?.currency ?? "USD")
  if (!currency) {
    return NextResponse.json(
      { error: `Currency must be one of ${SUPPORTED_CHECKOUT_CURRENCIES.join(", ")}` },
      { status: 400 },
    )
  }
  const description = String(body?.description ?? "").trim().slice(0, 500) || null
  const trialDaysRaw = Number(body?.trial_days ?? 0)
  const trialDays =
    mode === "subscription" && Number.isFinite(trialDaysRaw) && trialDaysRaw > 0
      ? Math.min(365, Math.round(trialDaysRaw))
      : null

  let redirectUrl: string | null = null
  const redirectRaw = String(body?.redirect_url ?? "").trim()
  if (redirectRaw) {
    try {
      const parsed = new URL(redirectRaw)
      if (parsed.protocol !== "https:") throw new Error("insecure")
      redirectUrl = parsed.toString()
    } catch {
      return NextResponse.json(
        { error: "Enter a full https:// address for the page customers land on" },
        { status: 400 },
      )
    }
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("payment_links")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: "You already have a link with this name" }, { status: 409 })
  }

  let autopayoutConfigId: string | null = null
  if (rail === "stablecoin") {
    const created = await createAutopayoutConfig(request, user, {
      recipientId: body?.recipient_id,
      payerWalletId: body?.payer_wallet_id,
      label,
      cryptoCurrency: body?.crypto_currency,
      network: body?.network,
      fiatPrepareAmount: amountCents / 100,
    })
    if (!created.ok) return created.response
    autopayoutConfigId = String(created.config.id)
  }

  let stripePriceId: string | null = null
  if (mode === "subscription" && billingInterval) {
    const price = await createRecurringPrice({
      label,
      description,
      amountCents,
      currency,
      interval: billingInterval,
    })
    if (!price.ok) {
      return NextResponse.json({ error: price.error }, { status: price.status })
    }
    stripePriceId = price.priceId
  }

  const { data: inserted, error } = await admin
    .from("payment_links")
    .insert({
      business_id: ctx.businessId,
      created_by: user.id,
      slug,
      label,
      description,
      amount_cents: amountCents,
      currency,
      rail,
      mode,
      billing_interval: billingInterval,
      trial_days: trialDays,
      redirect_url: redirectUrl,
      stripe_price_id: stripePriceId,
      autopayout_config_id: autopayoutConfigId,
    })
    .select(LINK_COLUMNS)
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Could not create link" }, { status: 400 })
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("easetag")
    .eq("id", ctx.businessId)
    .maybeSingle()
  const link = mapRowToPaymentLink(inserted as Record<string, unknown>)

  return NextResponse.json(
    {
      link: {
        ...link,
        url: buildPaymentLinkUrl(typeof biz?.easetag === "string" ? biz.easetag : null, link),
      },
    },
    { status: 201 },
  )
}
