import { NextResponse } from "next/server"
import type { WalletSendComplianceRail } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { liftLimitOverride, upsertLimitOverride } from "@/lib/wallet-send-compliance"

function parseRail(raw: unknown): WalletSendComplianceRail | null {
  return raw === "stablecoin" || raw === "fiat_payout" ? raw : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as {
    rail?: string
    dailyMaxUsd?: number
    expiresAt?: string | null
    reason?: string | null
  }
  const rail = parseRail(body.rail)
  const dailyMaxUsd = Number(body.dailyMaxUsd)
  if (!rail || !Number.isFinite(dailyMaxUsd) || dailyMaxUsd < 0) {
    return NextResponse.json({ error: "rail and dailyMaxUsd are required" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const override = await upsertLimitOverride(admin, {
    businessId,
    rail,
    dailyMaxUsd,
    expiresAt: body.expiresAt ?? null,
    reason: body.reason ?? null,
    adminId: auth.ctx.userId,
  })
  await logAdminAction(auth.ctx.userId, "wallet_send.limit_override_set", businessId, {
    rail,
    dailyMaxUsd,
  })
  return NextResponse.json({ ok: true, override })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })
  const rail = parseRail(new URL(request.url).searchParams.get("rail"))
  if (!rail) return NextResponse.json({ error: "rail is required" }, { status: 400 })
  const admin = createSupabaseAdmin()
  const lifted = await liftLimitOverride(admin, businessId, rail)
  await logAdminAction(auth.ctx.userId, "wallet_send.limit_override_lift", businessId, {
    rail,
    ...lifted,
  })
  return NextResponse.json({ ok: true, ...lifted })
}
