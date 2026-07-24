import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { confirmGridCrossBorderTransfer } from "@/lib/grid/cross-border-orchestrator"

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

  const body = (await request.json().catch(() => null)) as { leg2DraftId?: string } | null
  const quoteId = body?.leg2DraftId?.trim()
  if (!quoteId) {
    return NextResponse.json({ error: "leg2DraftId required" }, { status: 400 })
  }

  try {
    const result = await confirmGridCrossBorderTransfer({
      admin,
      userId: kycUserId,
      businessId,
      quoteId,
    })

    return NextResponse.json({
      ok: true,
      provider: "grid",
      quotePhase: "locked",
      transferId: result.transferId,
      transactionId: result.transactionId,
      easnerTransactionId: result.easnerTransactionId,
      localPayIn: result.localPayIn,
      customerRate: result.customerRate,
      receiveAmount: result.receiveAmount,
      receiveCurrency: result.receiveCurrency,
      bankInfo: result.bankInfo,
      expiresAt: result.expiresAt,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "grid_cross_border_confirm_failed"
    return NextResponse.json({ error: message, code: "grid_cross_border_confirm_failed" }, { status: 400 })
  }
}
