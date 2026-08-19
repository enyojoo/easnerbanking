import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { firstGridPaymentInstructionWalletInfo } from "@/lib/grid/external-account"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response

  const admin = createSupabaseAdmin()
  const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
  const orgOwnerId =
    noahCtxResult.scope === "business" && noahCtxResult.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtxResult.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number
    payInCurrency?: string
    payInCountry?: string
    leg2DraftId?: string
  } | null

  const quoteId = body?.leg2DraftId?.trim()
  if (!quoteId) {
    return NextResponse.json({ error: "leg2DraftId required" }, { status: 400 })
  }

  const { data: transfer } = await admin
    .from("grid_transfers")
    .select("*")
    .eq("user_id", kycUserId)
    .eq("mode", "cross_border_send")
    .eq("grid_quote_id", quoteId)
    .eq("status", "pending")
    .maybeSingle()

  if (!transfer) {
    return NextResponse.json({ error: "Grid cross-border quote not found" }, { status: 404 })
  }

  const metadata = (transfer.metadata ?? {}) as Record<string, unknown>
  const settlement = (transfer.settlement_info ?? {}) as {
    paymentInstructions?: unknown
  }

  return NextResponse.json({
    ok: true,
    provider: "grid",
    quotePhase: "leg2_locked",
    leg2DraftId: quoteId,
    transferId: String(transfer.id),
    transactionId: String(metadata.easner_transaction_id ?? ""),
    easnerTransactionId: String(metadata.easner_transaction_id ?? ""),
    localPayIn: Number(transfer.quoted_pay_in ?? 0),
    customerRate: Number(transfer.customer_rate ?? 0),
    receiveAmount: Number(transfer.quoted_receive ?? 0),
    receiveCurrency: String(transfer.receive_currency ?? ""),
    bankInfo: firstGridPaymentInstructionWalletInfo(settlement.paymentInstructions),
    expiresAt: String(transfer.expires_at ?? new Date().toISOString()),
  })
}
