import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { emptySendAllowance } from "@easner/shared"
import {
  isVelocityOutboundEnforced,
  isWalletSendCompliancePlatformEnabled,
  resolveSendAllowance,
  walletSendComplianceConfig,
} from "@/lib/wallet-send-compliance"

async function safeAllowance(
  admin: ReturnType<typeof createSupabaseAdmin>,
  input: Parameters<typeof resolveSendAllowance>[1],
) {
  try {
    return await resolveSendAllowance(admin, input)
  } catch (err) {
    console.error("[office/send-compliance] resolveSendAllowance failed", {
      rail: input.rail,
      error: err instanceof Error ? err.message : err,
    })
    return emptySendAllowance()
  }
}

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
  const [platformEnabled, stablecoin, fiatPayout] = await Promise.all([
    isWalletSendCompliancePlatformEnabled(admin),
    safeAllowance(admin, { businessId, rail: "stablecoin", amountUsd: 0 }),
    safeAllowance(admin, { businessId, rail: "fiat_payout", amountUsd: 0 }),
  ])
  return NextResponse.json({
    platformEnabled,
    stablecoin,
    fiatPayout,
    velocityEnforced: platformEnabled && isVelocityOutboundEnforced(stablecoin.velocityActive),
    shadowMode: cfg.shadowMode,
  })
}
