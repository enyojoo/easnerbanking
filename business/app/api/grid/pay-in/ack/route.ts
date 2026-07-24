import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/** User attestation only — Grid pay-in settlement is webhook-driven. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as { transactionId?: string } | null
  const transactionId = String(body?.transactionId ?? "").trim()
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: tx } = await admin
    .from("transactions")
    .select("id,metadata")
    .eq("id", transactionId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (!tx?.id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  const prior = tx.metadata && typeof tx.metadata === "object" ? (tx.metadata as Record<string, unknown>) : {}
  await admin
    .from("transactions")
    .update({
      metadata: { ...prior, grid_user_attested_pay_in_at: new Date().toISOString() },
    })
    .eq("id", tx.id)

  return NextResponse.json({ ok: true })
}
