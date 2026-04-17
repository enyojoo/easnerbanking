import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"

export const runtime = "nodejs"

/**
 * GET — Solana USDC/EURC balances at Turnkey-mapped `wallet_accounts` (chain truth for BYOW).
 * Response: `{ USD, EUR }` strings — same shape legacy clients expected for dashboard cards.
 *
 * @see https://docs.turnkey.com/api-reference/queries/get-balances
 */
export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
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

  const admin = createSupabaseAdmin()
  const result = await getTurnkeyDisplayBalancesUsdEur(admin, acc.ctx)

  return NextResponse.json({
    USD: result.USD,
    EUR: result.EUR,
    source: result.source,
    ...(result.detail ? { detail: result.detail } : {}),
  })
}
