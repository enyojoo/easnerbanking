import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { PayInAttestError, attestYcPayIn } from "@/lib/yellowcard/pay-in-attest"

export const runtime = "nodejs"

/** User attestation after sending a local YC pay-in transfer. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const easnerTransactionId = String(body?.transactionId ?? body?.easnerTransactionId ?? "").trim()
  const transferId = String(body?.transferId ?? "").trim()

  try {
    const result = await attestYcPayIn({
      admin: createSupabaseAdmin(),
      userId: user.id,
      businessId: noahCtxResult.scope === "business" ? noahCtxResult.businessId : null,
      easnerTransactionId: easnerTransactionId || undefined,
      transferId: transferId || undefined,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof PayInAttestError) {
      const status =
        e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : e.code === "id_required" ? 400 : 409
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status })
    }
    const message = e instanceof Error ? e.message : "attest_failed"
    return NextResponse.json({ ok: false, code: "attest_failed", message }, { status: 500 })
  }
}
