import { NextResponse } from "next/server"
import { parseCheckoutCurrency, SUPPORTED_CHECKOUT_CURRENCIES } from "@/lib/checkout/currencies"
import { mapProductRow } from "@/lib/products/types"
import { parsePaymentLinkInterval } from "@/lib/payment-links/types"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Product catalog list – products with their active and archived prices. */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const [{ data: products, error }, { data: prices }] = await Promise.all([
    admin
      .from("business_products")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false }),
    admin
      .from("business_product_prices")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: true }),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pricesByProduct = new Map<string, Record<string, unknown>[]>()
  for (const price of prices ?? []) {
    const key = String(price.product_id)
    const list = pricesByProduct.get(key) ?? []
    list.push(price as Record<string, unknown>)
    pricesByProduct.set(key, list)
  }

  return NextResponse.json({
    products: (products ?? []).map((row) =>
      mapProductRow(row as Record<string, unknown>, pricesByProduct.get(String(row.id)) ?? []),
    ),
  })
}

type PriceInput = {
  currency?: string
  amount?: number
  mode?: string
  interval?: string
  trial_days?: number
}

function parsePriceInput(raw: PriceInput, index: number):
  | { ok: true; row: { currency: string; unit_amount_cents: number; mode: string; billing_interval: string | null; trial_days: number | null } }
  | { ok: false; error: string } {
  const currency = parseCheckoutCurrency(raw.currency ?? "USD")
  if (!currency) {
    return { ok: false, error: `prices[${index}]: currency must be one of ${SUPPORTED_CHECKOUT_CURRENCIES.join(", ")}` }
  }
  const amountCents = Math.round(Number(raw.amount))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: `prices[${index}]: amount must be a positive integer in cents` }
  }
  const mode = raw.mode === "subscription" ? "subscription" : "one_time"
  let interval: string | null = null
  let trialDays: number | null = null
  if (mode === "subscription") {
    const parsed = parsePaymentLinkInterval(raw.interval ?? "month")
    if (!parsed) return { ok: false, error: `prices[${index}]: interval must be month or year` }
    interval = parsed
    const rawTrial = Number(raw.trial_days ?? 0)
    trialDays = Number.isFinite(rawTrial) && rawTrial > 0 ? Math.min(365, Math.round(rawTrial)) : null
  }
  return {
    ok: true,
    row: { currency, unit_amount_cents: amountCents, mode, billing_interval: interval, trial_days: trialDays },
  }
}

/** Create a product with one or more prices. */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    name?: string
    description?: string
    image_url?: string
    prices?: PriceInput[]
  } | null

  const name = String(body?.name ?? "").trim().slice(0, 200)
  if (!name) {
    return NextResponse.json({ error: "Give the product a name" }, { status: 400 })
  }
  const description = String(body?.description ?? "").trim().slice(0, 1000) || null

  let imageUrl: string | null = null
  const imageRaw = String(body?.image_url ?? "").trim()
  if (imageRaw) {
    try {
      const parsed = new URL(imageRaw)
      if (parsed.protocol !== "https:") throw new Error("insecure")
      imageUrl = parsed.toString()
    } catch {
      return NextResponse.json({ error: "Image must be a full https:// address" }, { status: 400 })
    }
  }

  const priceInputs = Array.isArray(body?.prices) ? body.prices : []
  if (priceInputs.length === 0) {
    return NextResponse.json({ error: "Add at least one price" }, { status: 400 })
  }
  if (priceInputs.length > 10) {
    return NextResponse.json({ error: "A product supports up to 10 prices" }, { status: 400 })
  }
  const priceRows: Array<Record<string, unknown>> = []
  for (const [index, raw] of priceInputs.entries()) {
    const parsed = parsePriceInput(raw ?? {}, index)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    priceRows.push(parsed.row)
  }

  const admin = createSupabaseAdmin()
  const { data: product, error } = await admin
    .from("business_products")
    .insert({ business_id: ctx.businessId, name, description, image_url: imageUrl })
    .select("*")
    .single()

  if (error || !product?.id) {
    return NextResponse.json({ error: error?.message || "Could not create product" }, { status: 500 })
  }

  const { data: insertedPrices, error: priceError } = await admin
    .from("business_product_prices")
    .insert(priceRows.map((row) => ({ ...row, product_id: product.id, business_id: ctx.businessId })))
    .select("*")

  if (priceError) {
    await admin.from("business_products").delete().eq("id", product.id)
    return NextResponse.json({ error: priceError.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      product: mapProductRow(
        product as Record<string, unknown>,
        (insertedPrices ?? []) as Record<string, unknown>[],
      ),
    },
    { status: 201 },
  )
}
