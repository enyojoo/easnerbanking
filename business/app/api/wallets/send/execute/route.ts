import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isWalletSendEnabled } from "@/lib/relay/config"
import { executeWalletSend, resolveWalletSendAccountContext } from "@/lib/wallet-send/wallet-send-orchestration"
import { validateWalletRecipientForSend, type WalletRecipientRow } from "@/lib/wallet-send/validate-recipient"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, auth.user.id, "send")
  if (restricted instanceof NextResponse) return restricted

  if (!isWalletSendEnabled()) {
    return NextResponse.json({ error: "wallet_send_disabled" }, { status: 503 })
  }

  const acc = await resolveWalletSendAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    formSessionId?: string
    reservedDebitEtid?: string
    reviewSnapshot?: Record<string, unknown>
  } | null

  const recipientId = String(body?.recipientId || "").trim()
  const formSessionId = String(body?.formSessionId || "").trim()
  if (!recipientId || !formSessionId) {
    return NextResponse.json({ error: "recipientId and formSessionId are required" }, { status: 400 })
  }

  const { data: recipient } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
  }

  const gate = validateWalletRecipientForSend(recipient as WalletRecipientRow)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 400 })
  }

  const businessId = acc.ctx.scope === "business" ? acc.ctx.subjectBusinessId : null
  const result = await executeWalletSend({
    admin,
    ctx: acc.ctx,
    userId: auth.user.id,
    businessId,
    recipient: recipient as WalletRecipientRow,
    formSessionId,
    reservedDebitEtid: body?.reservedDebitEtid,
    reviewSnapshot: body?.reviewSnapshot,
  })

  if (!result.ok) {
    if (result.error === "quote_expired") {
      console.warn("[wallet_send_execute] quote_expired", {
        userId: auth.user.id,
        recipientId,
        formSessionId,
      })
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    easner_transaction_id: result.easnerTransactionId,
    transaction_id: result.easnerTransactionId,
    status: result.status,
    provider: result.provider,
    provider_transaction_id: result.providerTransactionId,
    tx_hash: result.txHash,
  })
}
