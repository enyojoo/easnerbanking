import { NextResponse } from "next/server"
import type { WalletSendComplianceRail } from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import { liftLimitOverride, upsertLimitOverride } from "@/lib/wallet-send-compliance"

async function businessIdForUser(userId: string) {
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", userId)
    .maybeSingle()
  return data?.easner_business_id ? String(data.easner_business_id) : null
}

function parseRail(raw: unknown): WalletSendComplianceRail | null {
  return raw === "stablecoin" || raw === "fiat_payout" ? raw : null
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { userId } = await params
  const businessId = await businessIdForUser(userId)
  if (!businessId) {
    return NextResponse.json({ error: "User has no business" }, { status: 400 })
  }
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
  await logAdminAction(auth.ctx.userId, "wallet_send.limit_override_set", userId, {
    businessId,
    rail,
    dailyMaxUsd,
  })
  return NextResponse.json({ ok: true, override })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { userId } = await params
  const businessId = await businessIdForUser(userId)
  if (!businessId) {
    return NextResponse.json({ error: "User has no business" }, { status: 400 })
  }
  const url = new URL(request.url)
  const rail = parseRail(url.searchParams.get("rail"))
  if (!rail) {
    return NextResponse.json({ error: "rail is required" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const lifted = await liftLimitOverride(admin, businessId, rail)
  await logAdminAction(auth.ctx.userId, "wallet_send.limit_override_lift", userId, {
    businessId,
    rail,
    ...lifted,
  })
  return NextResponse.json({ ok: true, ...lifted })
}
