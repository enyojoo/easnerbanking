import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"

export const runtime = "nodejs"

/**
 * POST — scan Solana USDC/EURC activity for the caller's Turnkey vault addresses and upsert
 * matching rows into the unified `transactions` ledger.
 *
 * Complements `POST /api/noah/sync-transactions` (Noah API only). Consumer stablecoin deposits
 * often appear on-chain before / without a Noah transaction row; mobile calls this after deposits
 * so dashboard / transactions lists stay aligned with `wallet_balances`.
 */
export async function POST(request: Request) {
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
  const walletOwnerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!walletOwnerId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_wallet_owner" })
  }

  try {
    const result = await backfillTurnkeyOnchainTransactions(admin, {
      walletOwnerId,
      signaturesPerAddress: 120,
    })
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
