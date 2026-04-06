import { NextResponse } from "next/server"
import { isAllowedBaseCurrency } from "@/lib/accounts/currency-controls"
import { mapRowToCustomerWithEmptyStats, type B2bCustomerRow } from "@/lib/b2b/map-customer"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: existing, error: fetchErr } = await admin
    .from("b2b_customers")
    .select("id")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === "string") updates.name = body.name.trim()
  if (typeof body.phone === "string") updates.phone = body.phone.trim()
  if (typeof body.company === "string") updates.company = body.company.trim()
  if (typeof body.address === "string") updates.address = body.address.trim()
  if (body.status === "active" || body.status === "inactive") updates.status = body.status

  if (typeof body.currency === "string") {
    const c = body.currency.trim().toUpperCase()
    if (!(await isAllowedBaseCurrency(c))) {
      return NextResponse.json({ error: `Currency ${c} is not allowed` }, { status: 400 })
    }
    updates.currency = c
  }

  const { data, error } = await admin
    .from("b2b_customers")
    .update(updates)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ customer: mapRowToCustomerWithEmptyStats(data as B2bCustomerRow) })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("b2b_customers")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
