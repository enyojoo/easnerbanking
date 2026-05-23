import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { buildPaymentMethodInsertPayload } from "@/lib/admin/payment-methods"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payment_methods")
    .select("*")
    .order("currency", { ascending: true })
    .order("is_default", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payment_methods: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const admin = createSupabaseAdmin()
  if (body.is_default === true && body.currency) {
    await admin
      .from("payment_methods")
      .update({ is_default: false })
      .eq("currency", String(body.currency))
  }

  let row: Record<string, unknown>
  try {
    row = buildPaymentMethodInsertPayload(body)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid payment method" },
      { status: 400 },
    )
  }

  const { data, error } = await admin.from("payment_methods").insert(row).select("*").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payment_method: data })
}
