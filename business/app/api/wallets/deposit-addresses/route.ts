import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth } from "@/app/api/noah/_helpers"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { trySyncTurnkeyDepositVaultsIfNeeded } from "@/lib/wallet/sync-deposit-vaults"

export const runtime = "nodejs"

/**
 * GET – Solana USDC / EURC deposit addresses from Turnkey `wallet_accounts` (matches /accounts + invoice pay-in).
 * `?mode=fast` – Home/wallets warm path: skip vault drain + Solana/Turnkey ATA ensure when ATA is stored.
 * default / `?mode=ensure` – Receive open / explicit refresh: full sync + verify/ensure.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, user.id, "deposit")
  if (restricted instanceof NextResponse) return restricted

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const url = new URL(request.url)
  const modeParam = String(url.searchParams.get("mode") ?? "").trim().toLowerCase()
  const mode = modeParam === "fast" ? "fast" : "ensure"

  const admin = createSupabaseAdmin()
  if (mode === "ensure") {
    await trySyncTurnkeyDepositVaultsIfNeeded(admin, acc.ctx)
  }
  const body = await getTurnkeyDepositAddressesForContext(admin, acc.ctx, { mode })

  return NextResponse.json(body)
}
