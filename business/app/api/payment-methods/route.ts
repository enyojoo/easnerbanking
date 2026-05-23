import { NextResponse } from "next/server"
import { getUserFromApiRequest, createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  filterActivePaymentMethodRows,
  toPublicPaymentMethodDetail,
  toPublicPaymentMethodSummary,
} from "@/lib/manual-send/public-payment-method"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const forParam = searchParams.get("for")
  const id = searchParams.get("id")?.trim()
  const currency = searchParams.get("currency")?.trim().toUpperCase()

  if (forParam !== "manual_send") {
    return NextResponse.json({ error: "for=manual_send is required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  if (id) {
    const { data, error } = await admin.from("payment_methods").select("*").eq("id", id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || String(data.status ?? "").toLowerCase() !== "active") {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 })
    }
    return NextResponse.json({
      payment_method: toPublicPaymentMethodDetail(data as Record<string, unknown>),
    })
  }

  if (!currency) {
    return NextResponse.json({ error: "currency or id is required" }, { status: 400 })
  }

  const { data, error } = await admin
    .from("payment_methods")
    .select("id,currency,name,type,is_default,status")
    .eq("currency", currency)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = filterActivePaymentMethodRows((data ?? []) as Record<string, unknown>[])
  return NextResponse.json({
    payment_methods: rows.map(toPublicPaymentMethodSummary),
  })
}
