import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { deleteCurrencyAndRates, updateCurrencyAdmin } from "@/lib/admin/rates-service"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  try {
    const admin = createSupabaseAdmin()
    const data = await updateCurrencyAdmin(admin, id, {
      can_send: typeof body.can_send === "boolean" ? body.can_send : undefined,
      can_receive: typeof body.can_receive === "boolean" ? body.can_receive : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
    })
    return NextResponse.json({ currency: data })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params

  try {
    const admin = createSupabaseAdmin()
    await deleteCurrencyAndRates(admin, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 400 },
    )
  }
}
