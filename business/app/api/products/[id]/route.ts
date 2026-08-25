import { NextResponse } from "next/server"
import { mapProductRow } from "@/lib/products/types"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Edit presentation or archive a product. Prices are append-and-archive – an
 * amount never changes in place, so past payments always reference what was
 * actually charged (add a new price and archive the old one instead).
 */
export async function PATCH(request: Request, context: Ctx) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    name?: string
    description?: string | null
    archived?: boolean
    archive_price_id?: string
  } | null

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("business_products")
    .select("id")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  if (!existing?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (body?.archive_price_id) {
    await admin
      .from("business_product_prices")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", body.archive_price_id)
      .eq("product_id", id)
      .eq("business_id", ctx.businessId)
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body && "name" in body) {
    const name = String(body.name ?? "").trim().slice(0, 200)
    if (!name) return NextResponse.json({ error: "Give the product a name" }, { status: 400 })
    patch.name = name
  }
  if (body && "description" in body) {
    patch.description = String(body.description ?? "").trim().slice(0, 1000) || null
  }
  if (body && typeof body.archived === "boolean") {
    patch.archived_at = body.archived ? new Date().toISOString() : null
  }

  const { data: updated, error } = await admin
    .from("business_products")
    .update(patch)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Could not save product" }, { status: 400 })
  }

  const { data: prices } = await admin
    .from("business_product_prices")
    .select("*")
    .eq("product_id", id)
    .order("created_at", { ascending: true })

  return NextResponse.json({
    product: mapProductRow(
      updated as Record<string, unknown>,
      (prices ?? []) as Record<string, unknown>[],
    ),
  })
}
