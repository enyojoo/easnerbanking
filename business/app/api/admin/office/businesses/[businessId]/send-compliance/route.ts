import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  isVelocityOutboundEnforced,
  resolveSendAllowance,
  walletSendComplianceConfig,
} from "@/lib/wallet-send-compliance"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { businessId } = await params
  if (!businessId) return NextResponse.json({ error: "Missing business id" }, { status: 400 })
  const admin = createSupabaseAdmin()
  const cfg = walletSendComplianceConfig()
  const [stablecoin, fiatPayout] = await Promise.all([
    resolveSendAllowance(admin, { businessId, rail: "stablecoin", amountUsd: 0 }),
    resolveSendAllowance(admin, { businessId, rail: "fiat_payout", amountUsd: 0 }),
  ])
  return NextResponse.json({
    stablecoin,
    fiatPayout,
    velocityEnforced: isVelocityOutboundEnforced(stablecoin.velocityActive),
    shadowMode: cfg.shadowMode,
  })
}
