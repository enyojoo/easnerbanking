import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { backfillTurnkeyOnchainTransactions } from "@/lib/turnkey/onchain-backfill"

export const runtime = "nodejs"

const MIN_SYNC_INTERVAL_MS = 10 * 60_000
const lastSyncAtByOwner = new Map<string, number>()
const inFlightByOwner = new Map<string, Promise<unknown>>()

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

  const now = Date.now()
  const lastAt = lastSyncAtByOwner.get(walletOwnerId) ?? 0
  if (now - lastAt < MIN_SYNC_INTERVAL_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cooldown",
      retryAfterMs: Math.max(MIN_SYNC_INTERVAL_MS - (now - lastAt), 0),
    })
  }

  const inFlight = inFlightByOwner.get(walletOwnerId)
  if (inFlight) {
    try {
      const awaited = await inFlight
      return NextResponse.json({ ok: true, deduped: true, result: awaited })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, deduped: true, error: msg }, { status: 500 })
    }
  }

  try {
    const run = backfillTurnkeyOnchainTransactions(admin, {
      walletOwnerId,
      // Keep this cheap; this endpoint is triggered by clients and can be called often.
      // Increase only for one-off manual repairs.
      signaturesPerAddress: 40,
    })
    inFlightByOwner.set(walletOwnerId, run)
    const result = await run
    lastSyncAtByOwner.set(walletOwnerId, Date.now())
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    inFlightByOwner.delete(walletOwnerId)
  }
}
