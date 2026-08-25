import type { SupabaseClient } from "@supabase/supabase-js"
import { parseCheckoutCurrency, type CheckoutCurrency } from "@/lib/checkout/currencies"

/**
 * Product catalog: a product defined once powers payment links, website checkout
 * sessions (`product_id` on POST /v1/checkout/sessions), and invoice line items.
 */
export type ProductPrice = {
  id: string
  currency: CheckoutCurrency
  unitAmountCents: number
  mode: "one_time" | "subscription"
  billingInterval: "month" | "year" | null
  trialDays: number | null
  stripePriceId: string | null
  archivedAt: string | null
}

export type Product = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  archivedAt: string | null
  createdAt: string
  prices: ProductPrice[]
}

export function mapProductPriceRow(row: Record<string, unknown>): ProductPrice {
  const mode = String(row.mode ?? "one_time")
  const interval = String(row.billing_interval ?? "")
  return {
    id: String(row.id),
    currency: parseCheckoutCurrency(row.currency) ?? "USD",
    unitAmountCents: Math.round(Number(row.unit_amount_cents ?? 0)),
    mode: mode === "subscription" ? "subscription" : "one_time",
    billingInterval: interval === "month" || interval === "year" ? interval : null,
    trialDays: row.trial_days == null ? null : Math.round(Number(row.trial_days)),
    stripePriceId: row.stripe_price_id ? String(row.stripe_price_id) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  }
}

export function mapProductRow(
  row: Record<string, unknown>,
  priceRows: Record<string, unknown>[],
): Product {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: row.description ? String(row.description) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at ?? ""),
    prices: priceRows.map(mapProductPriceRow),
  }
}

export type ResolvedProductPrice = {
  product: { id: string; name: string; description: string | null }
  price: ProductPrice
}

/**
 * Resolve a sellable price for a checkout surface. `priceId` pins one price;
 * otherwise the first active price matching `currency` (or the first active
 * price at all) is used. Archived products and prices are not sellable.
 */
export async function resolveProductPrice(
  admin: SupabaseClient,
  input: {
    businessId: string
    productId: string
    priceId?: string | null
    currency?: string | null
  },
): Promise<{ ok: true; resolved: ResolvedProductPrice } | { ok: false; status: number; error: string }> {
  const { data: product } = await admin
    .from("business_products")
    .select("id, name, description, archived_at")
    .eq("id", input.productId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (!product?.id) {
    return { ok: false, status: 404, error: "No product with that id" }
  }
  if (product.archived_at) {
    return { ok: false, status: 409, error: "This product is archived" }
  }

  const { data: priceRows } = await admin
    .from("business_product_prices")
    .select("*")
    .eq("product_id", input.productId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })

  const prices = (priceRows ?? []).map(mapProductPriceRow)
  if (prices.length === 0) {
    return { ok: false, status: 409, error: "This product has no active price" }
  }

  let price: ProductPrice | undefined
  if (input.priceId) {
    price = prices.find((row) => row.id === input.priceId)
    if (!price) {
      return { ok: false, status: 404, error: "No active price with that id on this product" }
    }
  } else if (input.currency) {
    const wanted = parseCheckoutCurrency(input.currency)
    price = prices.find((row) => row.currency === wanted) ?? undefined
    if (!price) {
      return { ok: false, status: 409, error: `This product has no ${input.currency} price` }
    }
  } else {
    price = prices[0]
  }

  return {
    ok: true,
    resolved: {
      product: {
        id: String(product.id),
        name: String(product.name ?? ""),
        description: product.description ? String(product.description) : null,
      },
      price,
    },
  }
}
