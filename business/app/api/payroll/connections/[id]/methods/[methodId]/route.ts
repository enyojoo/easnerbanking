import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncPayrollPersonReceivingMethod } from "@/lib/payroll/sync-person-receiving-method"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; methodId: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id, methodId } = await params
  const admin = createSupabaseAdmin()
  const { data: connection } = await admin.from("payroll_connections")
    .select("id").eq("id", id).eq("user_id", auth.user.id).eq("status", "approved").maybeSingle()
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  const { data: method } = await admin.from("payroll_payment_methods")
    .select("id").eq("id", methodId).eq("connection_id", id).eq("status", "active").maybeSingle()
  if (!method) return NextResponse.json({ error: "Receiving method not found" }, { status: 404 })
  await admin.from("payroll_connections").update({
    preferred_method_id: methodId, updated_at: new Date().toISOString(),
  }).eq("id", id)
  await syncPayrollPersonReceivingMethod(admin, id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; methodId: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id, methodId } = await params
  const admin = createSupabaseAdmin()
  const { data: connection } = await admin.from("payroll_connections")
    .select("preferred_method_id").eq("id", id).eq("user_id", auth.user.id).maybeSingle()
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  const { data: method } = await admin.from("payroll_payment_methods")
    .select("id,type").eq("id", methodId).eq("connection_id", id).maybeSingle()
  if (!method || method.type === "easetag") {
    return NextResponse.json({ error: "This receiving method cannot be deleted" }, { status: 400 })
  }
  await admin.from("payroll_payment_methods").update({
    status: "deleted", updated_at: new Date().toISOString(),
  }).eq("id", methodId)
  if (String(connection.preferred_method_id) === methodId) {
    const { data: easetag } = await admin.from("payroll_payment_methods")
      .select("id").eq("connection_id", id).eq("type", "easetag").eq("status", "active").maybeSingle()
    await admin.from("payroll_connections").update({
      preferred_method_id: easetag?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", id)
    await syncPayrollPersonReceivingMethod(admin, id)
  }
  return NextResponse.json({ ok: true })
}
