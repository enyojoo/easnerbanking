import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { buildPaymentMethodPatchPayload } from "@/lib/admin/payment-methods"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const admin = createSupabaseAdmin()
  if (body.is_default === true && body.currency) {
    await admin
      .from("payment_methods")
      .update({ is_default: false })
      .eq("currency", String(body.currency))
      .neq("id", id)
  }

  const patch = buildPaymentMethodPatchPayload(body)

  const { data, error } = await admin
    .from("payment_methods")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payment_method: data })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(_request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const admin = createSupabaseAdmin()
  const { error } = await admin.from("payment_methods").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
