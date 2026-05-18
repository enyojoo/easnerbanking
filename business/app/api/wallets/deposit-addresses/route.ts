import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"

export const runtime = "nodejs"

/**
 * GET — Solana USDC / EURC deposit addresses from Turnkey `wallet_accounts` (matches /accounts + invoice pay-in).
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const admin = createSupabaseAdmin()
  await trySyncTurnkeyDepositVaultsIfNeeded(admin, acc.ctx)
  const body = await getTurnkeyDepositAddressesForContext(admin, acc.ctx)

  return NextResponse.json(body)
}
