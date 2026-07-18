import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isWalletSendEnabled } from "@/lib/lifi/client"
import { confirmWalletSendOrder } from "@/lib/wallet-send/confirm-wallet-send-order"

/** Lock wallet send session for review (Turnkey direct + LI.FI). */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  if (!isWalletSendEnabled()) {
    return NextResponse.json({ ok: false, error: "Wallet send is not enabled." }, { status: 503 })
  }

  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as { formSessionId?: string } | null
  const formSessionId = String(body?.formSessionId || "").trim()
  if (!formSessionId) {
    return NextResponse.json({ ok: false, error: "formSessionId is required." }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { quote } = await confirmWalletSendOrder({
      admin,
      ctx: acc.ctx,
      userId: user.id,
      formSessionId,
    })
    return NextResponse.json({
      ok: true,
      quote: { ...quote, quotePhase: "locked", requiresConfirm: false, lockId: formSessionId },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Wallet send confirm failed"
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
