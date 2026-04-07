import { NextResponse } from "next/server"
import { isAllowedBaseCurrency } from "@/lib/accounts/currency-controls"
import { mapRowToCustomerWithEmptyStats, type B2bCustomerRow } from "@/lib/b2b/map-customer"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("business_customers")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as B2bCustomerRow[]
  const customers = rows.map((r) => mapRowToCustomerWithEmptyStats(r))
  return NextResponse.json({ customers })
}

type CreateBody = {
  name?: string
  email?: string
  phone?: string
  company?: string
  address?: string
  currency?: string
  status?: "active" | "inactive"
}

export async function POST(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = String(body.name ?? "").trim()
  const email = String(body.email ?? "").trim().toLowerCase()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

  const currencyRaw = String(body.currency ?? "USD").trim().toUpperCase()
  if (!(await isAllowedBaseCurrency(currencyRaw))) {
    return NextResponse.json({ error: `Currency ${currencyRaw} is not allowed` }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("business_customers")
    .insert({
      business_id: ctx.businessId,
      name,
      email,
      phone: String(body.phone ?? "").trim(),
      company: String(body.company ?? "").trim(),
      address: String(body.address ?? "").trim(),
      currency: currencyRaw,
      status: body.status === "inactive" ? "inactive" : "active",
    })
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const customer = mapRowToCustomerWithEmptyStats(data as B2bCustomerRow)
  return NextResponse.json({ customer })
}
