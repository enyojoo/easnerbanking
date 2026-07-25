import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ackGridPayIn, GridPayInAckError } from "@/lib/grid/pay-in-ack"

export const runtime = "nodejs"

/** User attestation only — Grid pay-in settlement is webhook-driven. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const easnerTransactionId = String(body?.transactionId ?? body?.easnerTransactionId ?? "").trim()
  const transactionId = String(body?.transactionId ?? "").trim()

  try {
    const result = await ackGridPayIn({
      admin: createSupabaseAdmin(),
      userId: user.id,
      businessId: noahCtxResult.scope === "business" ? noahCtxResult.businessId : null,
      easnerTransactionId: easnerTransactionId || undefined,
      transactionId: transactionId || undefined,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof GridPayInAckError) {
      const status =
        e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : e.code === "id_required" ? 400 : 409
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status })
    }
    const message = e instanceof Error ? e.message : "ack_failed"
    return NextResponse.json({ ok: false, code: "ack_failed", message }, { status: 500 })
  }
}
