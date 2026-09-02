import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { emptySendAllowance } from "@easner/shared"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import {
  isVelocityOutboundEnforced,
  isWalletSendCompliancePlatformEnabled,
  resolveSendAllowance,
} from "@/lib/wallet-send-compliance"

export const runtime = "nodejs"

/** Daily + velocity send allowance for the authenticated business. */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const platformEnabled = await isWalletSendCompliancePlatformEnabled(admin)
  const acc = await resolveNoahAccountContext(request, user.id, undefined, "read")
  if (!acc.ok) {
    return NextResponse.json({
      stablecoin: emptySendAllowance(),
      fiatPayout: emptySendAllowance(),
      platformEnabled,
      velocityEnforced: false,
    })
  }

  const businessId = acc.ctx.scope === "business" ? acc.ctx.subjectBusinessId : null
  if (!businessId) {
    return NextResponse.json({
      stablecoin: emptySendAllowance(),
      fiatPayout: emptySendAllowance(),
      platformEnabled,
      velocityEnforced: false,
    })
  }

  const [stablecoin, fiatPayout] = await Promise.all([
    resolveSendAllowance(admin, { businessId, rail: "stablecoin", amountUsd: 0 }),
    resolveSendAllowance(admin, { businessId, rail: "fiat_payout", amountUsd: 0 }),
  ])

  return NextResponse.json({
    platformEnabled,
    stablecoin,
    fiatPayout,
    velocityEnforced: platformEnabled && isVelocityOutboundEnforced(stablecoin.velocityActive),
  })
}
